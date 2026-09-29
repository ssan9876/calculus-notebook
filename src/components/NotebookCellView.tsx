import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, Copy, GripVertical, Play, Plus, Square, Trash2 } from 'lucide-react'
import type { CellKind, KernelLanguage, NotebookCell } from '../types'
import type { Completion } from '@codemirror/autocomplete'
import { CodeCellEditor } from './CodeCellEditor'
import { OutputView } from './OutputView'

interface Props {
  cell: NotebookCell; index: number; active: boolean
  onActivate: () => void; onChange: (source: string) => void; onRun: () => void; onRunAndAdvance: () => void
  onInterrupt: () => void; onDelete: () => void; onDuplicate: () => void
  onAddAfter: (kind: CellKind) => void; onLanguage: (language: KernelLanguage) => void; onToggleOutput: () => void
  completions?: Completion[]
  onWidgetChange?: (name: string, value: number) => void
}

export function NotebookCellView(props: Props) {
  const { cell, index, active } = props
  const [editingText, setEditingText] = useState(cell.kind === 'code')
  const sortable = useSortable({ id: cell.id })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  const statusLabel = cell.status === 'running' ? '…' : cell.executionCount ? String(cell.executionCount) : ' '

  return (
    <article ref={sortable.setNodeRef} style={style} className={`cell cell-${cell.kind} ${active ? 'is-active' : ''} status-${cell.status} ${sortable.isDragging ? 'is-dragging' : ''}`} onClick={props.onActivate} data-cell-id={cell.id}>
      <div className="cell-rail" aria-hidden="true"><span className="execution-label">{cell.kind === 'code' ? `In [${statusLabel}]` : 'Text'}</span><span className="rail-node" /></div>
      <div className="cell-body">
        <div className="cell-actions">
          <button ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} className="drag-handle" aria-label={`Move cell ${index + 1}`}><GripVertical size={15} /></button>
          {cell.kind === 'code' ? (
            <select value={cell.language} onChange={(event) => props.onLanguage(event.target.value as KernelLanguage)} aria-label="Cell language">
              <option value="math">Math</option><option value="python">Python</option>
            </select>
          ) : <span className="cell-kind">Markdown</span>}
          <span className="cell-spacer" />
          {cell.outputs.length > 0 && <button onClick={(event) => { event.stopPropagation(); props.onToggleOutput() }} aria-label={cell.collapsed ? 'Show output' : 'Hide output'}>{cell.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
          {cell.kind === 'code' && <button onClick={(event) => { event.stopPropagation(); cell.status === 'running' ? props.onInterrupt() : props.onRun() }} aria-label={cell.status === 'running' ? 'Stop cell' : 'Run cell'}>{cell.status === 'running' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>}
          <button onClick={(event) => { event.stopPropagation(); props.onDuplicate() }} aria-label="Duplicate cell"><Copy size={14} /></button>
          <button onClick={(event) => { event.stopPropagation(); props.onDelete() }} aria-label="Delete cell"><Trash2 size={14} /></button>
        </div>
        {cell.kind === 'text' && !editingText ? (
          <div className="markdown-body" onDoubleClick={() => setEditingText(true)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.source || '*Double-click to write Markdown.*'}</ReactMarkdown>
            <button className="edit-hint" onClick={() => setEditingText(true)}>Edit text</button>
          </div>
        ) : (
          <div onBlur={(event) => { if (cell.kind === 'text' && !event.currentTarget.contains(event.relatedTarget)) setEditingText(false) }}>
            <CodeCellEditor value={cell.source} kind={cell.kind} language={cell.language} onChange={props.onChange} onRun={props.onRun} onRunAndAdvance={props.onRunAndAdvance} onAddBelow={() => props.onAddAfter('code')} autoFocus={active && !cell.source} completions={props.completions} />
          </div>
        )}
        {!cell.collapsed && <OutputView outputs={cell.outputs} count={cell.executionCount} onWidgetChange={props.onWidgetChange} />}
        {active && <div className="insert-row"><button onClick={() => props.onAddAfter('code')}><Plus size={13} /> Code</button><button onClick={() => props.onAddAfter('text')}><Plus size={13} /> Text</button></div>}
      </div>
    </article>
  )
}
