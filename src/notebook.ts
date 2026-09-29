import { z } from 'zod'
import type { KernelLanguage, NotebookCell, NotebookDocument, OutputItem } from './types'

const outputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), data: z.string() }),
  z.object({ type: z.literal('stream'), data: z.string(), name: z.enum(['stdout', 'stderr']) }),
  z.object({ type: z.literal('latex'), data: z.string() }),
  z.object({ type: z.literal('html'), data: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mime: z.enum(['image/png', 'image/svg+xml']), alt: z.string().optional() }),
  z.object({ type: z.literal('plot'), data: z.object({
    expression: z.string(), variable: z.string(), min: z.number(), max: z.number(),
    points: z.array(z.object({ x: z.number(), y: z.number() })),
  }) }),
  z.object({ type: z.literal('table'), data: z.object({
    columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    index: z.array(z.union([z.string(), z.number()])).optional(),
  }) }),
  z.object({ type: z.literal('widget'), data: z.object({ name: z.string(), min: z.number(), max: z.number(), step: z.number().positive(), value: z.number() }) }),
  z.object({ type: z.literal('error'), data: z.string(), traceback: z.string().optional() }),
])

const cellSchema = z.object({
  id: z.string().min(1), kind: z.enum(['code', 'text']), language: z.enum(['math', 'python']).optional(),
  source: z.string(), status: z.enum(['idle', 'queued', 'running', 'success', 'error', 'stale']),
  executionCount: z.number().int().positive().optional(), outputs: z.array(outputSchema), collapsed: z.boolean().optional(),
})

export const notebookSchema = z.object({
  version: z.literal(2), id: z.string().min(1), title: z.string().min(1).max(240),
  defaultLanguage: z.enum(['math', 'python']), cells: z.array(cellSchema).min(1).max(5000),
  createdAt: z.string(), updatedAt: z.string(),
})

export const uid = () => crypto.randomUUID()

export function createCell(kind: 'code' | 'text' = 'code', language: KernelLanguage = 'math', source = ''): NotebookCell {
  return { id: uid(), kind, language: kind === 'code' ? language : undefined, source, status: 'idle', outputs: [] }
}

export function createNotebook(title = 'Untitled notebook', language: KernelLanguage = 'math'): NotebookDocument {
  const now = new Date().toISOString()
  return { version: 2, id: uid(), title, defaultLanguage: language, createdAt: now, updatedAt: now, cells: [createCell('code', language)] }
}

export function createStarterNotebook(): NotebookDocument {
  const notebook = createNotebook('A small study of oscillation')
  notebook.cells = [
    createCell('text', 'math', '# A small study of oscillation\n\nChange an expression, then press **Shift + Enter** to evaluate it.'),
    createCell('code', 'math', 'f(x) = sin(x) * exp(-x / 8)'),
    createCell('code', 'math', 'f(pi / 2)'),
    createCell('code', 'math', 'plot(f(x), x, 0, 8 * pi)'),
  ]
  return notebook
}

export function duplicateNotebook(source: NotebookDocument): NotebookDocument {
  const now = new Date().toISOString()
  return {
    ...source, id: uid(), title: `${source.title} copy`, createdAt: now, updatedAt: now,
    cells: source.cells.map((cell) => ({ ...cell, id: uid(), status: 'idle', executionCount: undefined, outputs: [] })),
  }
}

export function parseNotebook(value: unknown): NotebookDocument {
  const raw = value as Record<string, unknown>
  if (raw?.version === 1 && Array.isArray(raw.cells)) {
    const now = new Date().toISOString()
    const migrated: NotebookDocument = {
      version: 2, id: uid(), title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Imported notebook',
      defaultLanguage: 'math', createdAt: now, updatedAt: now,
      cells: (raw.cells as Array<Record<string, unknown>>).map((cell) => ({
        id: typeof cell.id === 'string' ? cell.id : uid(), kind: cell.kind === 'text' ? 'text' : 'code',
        language: cell.kind === 'text' ? undefined : 'math', source: typeof cell.source === 'string' ? cell.source : '',
        status: 'idle', outputs: [],
      })),
    }
    return notebookSchema.parse(migrated)
  }
  return notebookSchema.parse(value)
}

export function downloadFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const safeFilename = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'notebook'

export function downloadNotebook(notebook: NotebookDocument) {
  downloadFile(JSON.stringify(notebook, null, 2), `${safeFilename(notebook.title)}.calc.json`, 'application/json')
}

export interface JupyterNotebook {
  nbformat: 4
  nbformat_minor: 5
  metadata: Record<string, unknown>
  cells: Array<Record<string, unknown>>
}

function outputToJupyter(output: OutputItem): Record<string, unknown> | null {
  if (output.type === 'stream') return { output_type: 'stream', name: output.name, text: output.data.split(/(?<=\n)/) }
  if (output.type === 'error') return { output_type: 'error', ename: 'Error', evalue: output.data, traceback: (output.traceback ?? output.data).split('\n') }
  if (output.type === 'image') return { output_type: 'display_data', data: { [output.mime]: output.data.replace(/^data:[^,]+,/, '') }, metadata: {} }
  if (output.type === 'latex') return { output_type: 'execute_result', data: { 'text/latex': output.data }, metadata: {}, execution_count: null }
  if (output.type === 'html') return { output_type: 'display_data', data: { 'text/html': output.data }, metadata: {} }
  if (output.type === 'text') return { output_type: 'execute_result', data: { 'text/plain': output.data }, metadata: {}, execution_count: null }
  if (output.type === 'table') return { output_type: 'display_data', data: { 'application/vnd.calculus.table+json': output.data, 'text/plain': `[${output.data.rows.length} rows × ${output.data.columns.length} columns]` }, metadata: {} }
  if (output.type === 'widget') return { output_type: 'display_data', data: { 'application/vnd.calculus.widget+json': output.data }, metadata: {} }
  return null
}

export function toJupyter(notebook: NotebookDocument): JupyterNotebook {
  return {
    nbformat: 4, nbformat_minor: 5,
    metadata: {
      kernelspec: notebook.defaultLanguage === 'python'
        ? { display_name: 'Python 3 (Pyodide)', language: 'python', name: 'python3' }
        : { display_name: 'Calculus Math', language: 'math', name: 'calculus-math' },
      language_info: { name: notebook.defaultLanguage }, calculus: { version: 2, id: notebook.id },
    },
    cells: notebook.cells.map((cell) => cell.kind === 'text'
      ? { cell_type: 'markdown', metadata: {}, source: cell.source.split(/(?<=\n)/) }
      : { cell_type: 'code', metadata: { calculus: { language: cell.language } }, source: cell.source.split(/(?<=\n)/),
          execution_count: cell.executionCount ?? null, outputs: cell.outputs.map(outputToJupyter).filter(Boolean) }),
  }
}

export function downloadIpynb(notebook: NotebookDocument) {
  downloadFile(JSON.stringify(toJupyter(notebook), null, 2), `${safeFilename(notebook.title)}.ipynb`, 'application/x-ipynb+json')
}

const sourceText = (source: unknown) => Array.isArray(source) ? source.join('') : typeof source === 'string' ? source : ''

export function fromJupyter(value: unknown, filename = 'Imported notebook'): NotebookDocument {
  const raw = value as JupyterNotebook
  if (raw?.nbformat !== 4 || !Array.isArray(raw.cells)) throw new Error('Only Jupyter notebook format 4 is supported.')
  const languageName = ((raw.metadata?.language_info as Record<string, unknown> | undefined)?.name ?? 'python')
  const language: KernelLanguage = languageName === 'math' ? 'math' : 'python'
  const notebook = createNotebook(filename.replace(/\.ipynb$/i, ''), language)
  notebook.cells = raw.cells.map((cell) => {
    const kind = cell.cell_type === 'markdown' ? 'text' : 'code'
    const calculus = (cell.metadata as Record<string, unknown> | undefined)?.calculus as Record<string, unknown> | undefined
    const cellLanguage: KernelLanguage = calculus?.language === 'math' ? 'math' : language
    return { ...createCell(kind, cellLanguage, sourceText(cell.source)), executionCount: typeof cell.execution_count === 'number' ? cell.execution_count : undefined }
  })
  if (!notebook.cells.length) notebook.cells = [createCell('code', language)]
  return notebook
}
