import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { autocompletion, type Completion } from '@codemirror/autocomplete'
import type { CellKind, KernelLanguage } from '../types'

const calculusTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: '#1c1e21', fontSize: '14px' },
  '.cm-content': { fontFamily: 'IBM Plex Mono, monospace', padding: '14px 16px', caretColor: '#2855d9' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { display: 'none' },
  '.cm-scroller': { lineHeight: '1.65', overflow: 'auto' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#dce4fb !important' },
  '.cm-cursor': { borderLeftColor: '#2855d9' },
})

interface Props {
  value: string
  kind: CellKind
  language?: KernelLanguage
  onChange: (value: string) => void
  onRun: () => void
  onRunAndAdvance: () => void
  onAddBelow: () => void
  autoFocus?: boolean
  completions?: Completion[]
}

export function CodeCellEditor({ value, kind, language, onChange, onRun, onRunAndAdvance, onAddBelow, autoFocus, completions = [] }: Props) {
  const extensions = [calculusTheme, EditorView.lineWrapping]
  if (kind === 'text') extensions.push(markdown())
  if (language === 'python') extensions.push(python())
  if (kind === 'code') extensions.push(autocompletion({ override: [(context) => {
    const word = context.matchBefore(/[\w.]+/)
    if (!word && !context.explicit) return null
    return { from: word?.from ?? context.pos, options: completions }
  }] }))

  return (
    <CodeMirror
      value={value}
      extensions={extensions}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      minHeight={kind === 'text' ? '72px' : '54px'}
      autoFocus={autoFocus}
      onChange={onChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); onRunAndAdvance() }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onRun() }
        else if (event.key === 'Enter' && event.altKey) { event.preventDefault(); onAddBelow() }
      }}
      aria-label={`${kind === 'text' ? 'Markdown' : language === 'python' ? 'Python' : 'Math'} cell editor`}
    />
  )
}
