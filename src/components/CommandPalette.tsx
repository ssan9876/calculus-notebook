import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Search, Sparkles, X } from 'lucide-react'

export interface PaletteCommand { id: string; label: string; description: string; shortcut?: string; run: () => void }

export function CommandPalette({ open, commands, onAsk, onClose }: { open: boolean; commands: PaletteCommand[]; onAsk: (query: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    setQuery(''); window.setTimeout(() => inputRef.current?.focus(), 0)
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  }, [open, onClose])
  const matches = useMemo(() => commands.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(query.toLowerCase())), [commands, query])
  if (!open) return null
  const ask = () => { if (query.trim()) { onAsk(query.trim().replace(/^\?\s*/, '')); onClose() } }
  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="palette-input"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') matches[0] ? (matches[0].run(), onClose()) : ask() }} placeholder="Run a command or ask a question" aria-label="Command or question" /><button onClick={onClose} aria-label="Close command palette"><X size={15} /></button></div>
      <div className="palette-results">
        {matches.slice(0, 8).map((command) => <button key={command.id} onClick={() => { command.run(); onClose() }}><Command size={15} /><span><strong>{command.label}</strong><small>{command.description}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
        {query.trim() && <button className="ask-command" onClick={ask}><Sparkles size={15} /><span><strong>Ask Calculus</strong><small>Translate “{query.replace(/^\?\s*/, '')}” into a notebook step</small></span><kbd>Enter</kbd></button>}
        {!query && <p className="palette-hint">Type a command, or ask “convert 5 km to miles”.</p>}
      </div>
    </section>
  </div>
}
