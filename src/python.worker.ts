/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide'
import type { KernelVariable, OutputItem } from './types'

declare const self: DedicatedWorkerGlobalScope

let pyodide: PyodideInterface | null = null
let interruptView: Uint8Array | null = null
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/'

const RUNNER = String.raw`
import ast, base64, contextlib, io, json, traceback

def __calculus_execute(source):
    stdout, stderr = io.StringIO(), io.StringIO()
    outputs = []
    try:
        tree = ast.parse(source, mode="exec")
        last = tree.body[-1] if tree.body else None
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if isinstance(last, ast.Expr):
                body = ast.Module(body=tree.body[:-1], type_ignores=[])
                if body.body:
                    exec(compile(body, "<notebook>", "exec"), globals())
                value = eval(compile(ast.Expression(last.value), "<notebook>", "eval"), globals())
            else:
                exec(compile(tree, "<notebook>", "exec"), globals())
                value = None
        if stdout.getvalue(): outputs.append({"type":"stream", "name":"stdout", "data":stdout.getvalue()})
        if stderr.getvalue(): outputs.append({"type":"stream", "name":"stderr", "data":stderr.getvalue()})
        if value is not None:
            try:
                import sympy
                if isinstance(value, sympy.Basic): outputs.append({"type":"latex", "data":sympy.latex(value)})
            except Exception: pass
            if type(value).__module__.startswith("pandas") and hasattr(value, "to_json"):
                try:
                    table = json.loads(value.to_json(orient="split", date_format="iso"))
                    outputs.append({"type":"table", "data":{"columns":[str(x) for x in table["columns"]], "rows":table["data"], "index":table.get("index")}})
                except Exception: pass
            elif hasattr(value, "_repr_html_"):
                try: outputs.append({"type":"html", "data":value._repr_html_()})
                except Exception: pass
            outputs.append({"type":"text", "data":repr(value)})
        try:
            import matplotlib.pyplot as plt
            figures = [plt.figure(number) for number in plt.get_fignums()]
            for figure in figures:
                buffer = io.BytesIO()
                figure.savefig(buffer, format="png", dpi=144, bbox_inches="tight")
                outputs.append({"type":"image", "mime":"image/png", "alt":"Matplotlib figure", "data":base64.b64encode(buffer.getvalue()).decode()})
            if figures: plt.close("all")
        except Exception: pass
    except KeyboardInterrupt:
        outputs.append({"type":"error", "data":"Execution interrupted."})
    except Exception as error:
        outputs.append({"type":"error", "data":f"{type(error).__name__}: {error}", "traceback":traceback.format_exc()})
    return json.dumps(outputs)

def __calculus_variables():
    hidden = {"ast","base64","contextlib","io","json","traceback","__calculus_execute","__calculus_variables"}
    result = []
    for name, value in globals().items():
        if name.startswith("_") or name in hidden: continue
        try: rendered = repr(value)
        except Exception: rendered = "<unavailable>"
        result.append({"name":name, "value":rendered[:240], "type":type(value).__name__})
    return json.dumps(result)
`

async function ensurePyodide() {
  if (pyodide) return pyodide
  self.postMessage({ type: 'phase', phase: 'loading', message: 'Loading Python runtime…' })
  const pyodideModule = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`) as { loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface> }
  pyodide = await pyodideModule.loadPyodide({ indexURL: PYODIDE_BASE })
  if (interruptView) pyodide.setInterruptBuffer(interruptView)
  await pyodide.runPythonAsync(RUNNER)
  self.postMessage({ type: 'phase', phase: 'ready', message: 'Python ready' })
  return pyodide
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data as { type: string; id?: string; source?: string; buffer?: SharedArrayBuffer }
  if (message.type === 'configure' && message.buffer) {
    interruptView = new Uint8Array(message.buffer)
    if (pyodide) pyodide.setInterruptBuffer(interruptView)
    return
  }
  if (message.type === 'reset') {
    pyodide = null
    self.postMessage({ type: 'phase', phase: 'offline', message: 'Python stopped' })
    return
  }
  if (message.type !== 'execute' || !message.id || message.source === undefined) return
  try {
    const py = await ensurePyodide()
    self.postMessage({ type: 'phase', phase: 'busy', message: 'Running Python' })
    await py.loadPackagesFromImports(message.source)
    const runner = py.globals.get('__calculus_execute')
    const resultProxy = await runner(message.source)
    runner.destroy?.()
    const outputs = JSON.parse(String(resultProxy)) as OutputItem[]
    resultProxy.destroy?.()
    const variableReader = py.globals.get('__calculus_variables')
    const variablesProxy = await variableReader()
    variableReader.destroy?.()
    const variables = JSON.parse(String(variablesProxy)) as KernelVariable[]
    variablesProxy.destroy?.()
    self.postMessage({ type: 'result', id: message.id, outputs, variables })
    self.postMessage({ type: 'phase', phase: 'ready', message: 'Python ready' })
  } catch (cause) {
    self.postMessage({ type: 'result', id: message.id, outputs: [{ type: 'error', data: cause instanceof Error ? cause.message : String(cause) }], variables: [] })
    self.postMessage({ type: 'phase', phase: 'error', message: 'Python needs attention' })
  }
}
