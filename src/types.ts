export type CellKind = 'code' | 'text'
export type KernelLanguage = 'math' | 'python'
export type CellStatus = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'stale'

export interface PlotData {
  expression: string
  variable: string
  min: number
  max: number
  points: Array<{ x: number; y: number }>
}

export interface TableData {
  columns: string[]
  rows: Array<Array<string | number | boolean | null>>
  index?: Array<string | number>
}

export interface WidgetData {
  name: string
  min: number
  max: number
  step: number
  value: number
}

export type OutputItem =
  | { type: 'text'; data: string }
  | { type: 'stream'; data: string; name: 'stdout' | 'stderr' }
  | { type: 'latex'; data: string }
  | { type: 'html'; data: string }
  | { type: 'image'; data: string; mime: 'image/png' | 'image/svg+xml'; alt?: string }
  | { type: 'plot'; data: PlotData }
  | { type: 'table'; data: TableData }
  | { type: 'widget'; data: WidgetData }
  | { type: 'error'; data: string; traceback?: string }

export interface NotebookCell {
  id: string
  kind: CellKind
  language?: KernelLanguage
  source: string
  status: CellStatus
  executionCount?: number
  outputs: OutputItem[]
  collapsed?: boolean
}

export interface NotebookDocument {
  version: 2
  id: string
  title: string
  defaultLanguage: KernelLanguage
  cells: NotebookCell[]
  createdAt: string
  updatedAt: string
}

export interface NotebookSummary {
  id: string
  title: string
  updatedAt: string
  cellCount: number
}

export interface KernelVariable {
  name: string
  value: string
  type?: string
}

export type KernelPhase = 'ready' | 'loading' | 'busy' | 'offline' | 'error'
