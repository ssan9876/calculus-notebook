import type { KernelLanguage, KernelPhase, KernelVariable, OutputItem } from './types'

export interface KernelResult { outputs: OutputItem[]; variables: KernelVariable[] }
export type PhaseListener = (language: KernelLanguage, phase: KernelPhase, message: string) => void

class PythonKernel {
  private worker: Worker | null = null
  private interruptView: Uint8Array | null = null
  private pending = new Map<string, { resolve: (result: KernelResult) => void; timeout: number }>()
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private onPhase: PhaseListener) {}

  private ensureWorker() {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
    if (globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
      const buffer = new SharedArrayBuffer(1)
      this.interruptView = new Uint8Array(buffer)
      this.worker.postMessage({ type: 'configure', buffer })
    }
    this.worker.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; id?: string; outputs?: OutputItem[]; variables?: KernelVariable[]; phase?: KernelPhase; message?: string }
      if (message.type === 'phase' && message.phase) this.onPhase('python', message.phase, message.message ?? message.phase)
      if (message.type === 'result' && message.id) {
        const request = this.pending.get(message.id)
        if (!request) return
        window.clearTimeout(request.timeout)
        this.pending.delete(message.id)
        request.resolve({ outputs: message.outputs ?? [], variables: message.variables ?? [] })
      }
    }
    this.worker.onerror = () => this.onPhase('python', 'error', 'Python worker stopped unexpectedly')
    return this.worker
  }

  execute(source: string): Promise<KernelResult> {
    const task = () => new Promise<KernelResult>((resolve) => {
      const worker = this.ensureWorker()
      const id = crypto.randomUUID()
      if (this.interruptView) Atomics.store(this.interruptView, 0, 0)
      const timeout = window.setTimeout(() => {
        this.interrupt()
        this.pending.delete(id)
        resolve({ outputs: [{ type: 'error', data: 'Execution exceeded the 30 second limit.' }], variables: [] })
      }, 30_000)
      this.pending.set(id, { resolve, timeout })
      worker.postMessage({ type: 'execute', id, source })
    })
    const result = this.queue.then(task, task)
    this.queue = result.catch(() => undefined)
    return result
  }

  interrupt() {
    if (this.interruptView) Atomics.store(this.interruptView, 0, 2)
    else this.restart('Execution stopped by restarting Python.')
  }

  restart(message = 'Python restarted') {
    this.worker?.terminate()
    this.worker = null
    this.interruptView = null
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout)
      request.resolve({ outputs: [{ type: 'error', data: message }], variables: [] })
    }
    this.pending.clear()
    this.queue = Promise.resolve()
    this.onPhase('python', 'offline', 'Python starts when first used')
  }
}

export class KernelManager {
  private python: PythonKernel
  private mathQueue: Promise<unknown> = Promise.resolve()
  private mathModule: Promise<typeof import('./kernel')> | null = null
  constructor(onPhase: PhaseListener) { this.python = new PythonKernel(onPhase) }

  execute(language: KernelLanguage, source: string): Promise<KernelResult> {
    if (language === 'python') return this.python.execute(source)
    const task = async () => {
      this.mathModule ??= import('./kernel')
      const math = await this.mathModule
      return { outputs: await math.evaluate(source), variables: math.getVariables() }
    }
    const result = this.mathQueue.then(task, task)
    this.mathQueue = result.catch(() => undefined)
    return result
  }

  interrupt(language: KernelLanguage) { if (language === 'python') this.python.interrupt() }
  restart(language?: KernelLanguage) {
    if (!language || language === 'math') {
      void this.mathModule?.then((math) => math.resetKernel())
      this.mathQueue = Promise.resolve()
    }
    if (!language || language === 'python') this.python.restart()
  }
}
