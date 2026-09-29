import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  BookOpen, Check, ChevronDown, Cloud, Command as CommandIcon, Copy, Download, FileJson, FilePlus2, Moon, Play, Plus, Printer, RefreshCw,
  Search, Sigma, Sparkles, Square, Sun, Trash2, Upload, Variable, WifiOff, X,
} from 'lucide-react'
import { KernelManager } from './kernels'
import { createCell, createNotebook, downloadIpynb, downloadNotebook, duplicateNotebook, fromJupyter, parseNotebook } from './notebook'
import { initializeWorkspace, loadWorkspaceNotebook, removeWorkspaceNotebook, saveWorkspaceNotebook } from './workspace'
import type { CellKind, KernelLanguage, KernelPhase, KernelVariable, NotebookCell, NotebookDocument, NotebookSummary } from './types'
import { NotebookCellView } from './components/NotebookCellView'
import { completionCatalog, dependentCellIds } from './dependency'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { interpretQuery } from './knowledge'
import { SyncPanel } from './components/SyncPanel'

type SaveState = 'loading' | 'dirty' | 'saving' | 'saved' | 'error'
interface Toast { message: string; tone?: 'error' | 'success' }

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))

export default function App() {
  const [notebook, setNotebook] = useState<NotebookDocument | null>(null)
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([])
  const [activeCellId, setActiveCellId] = useState<string>()
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [notebookSearch, setNotebookSearch] = useState('')
  const [searchCursor, setSearchCursor] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('calculus-theme') as 'light' | 'dark' | null) ?? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [variables, setVariables] = useState<Record<KernelLanguage, KernelVariable[]>>({ math: [], python: [] })
  const [kernelState, setKernelState] = useState<Record<KernelLanguage, { phase: KernelPhase; message: string }>>({
    math: { phase: 'ready', message: 'Math ready' }, python: { phase: 'offline', message: 'Python starts when first used' },
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const executionCount = useRef<Record<KernelLanguage, number>>({ math: 0, python: 0 })
  const saveGeneration = useRef(0)
  const notebookRef = useRef<NotebookDocument | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const workspaceOpened = useRef(false)
  const manager = useMemo(() => new KernelManager((language, phase, message) => {
    setKernelState((current) => ({ ...current, [language]: { phase, message } }))
  }), [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    initializeWorkspace().then(({ notebooks: items, active }) => {
      setNotebooks(items); setNotebook(active); setActiveCellId(active.cells[0]?.id); setSaveState('saved')
    }).catch((cause) => {
      setSaveState('error'); setToast({ tone: 'error', message: cause instanceof Error ? cause.message : 'The workspace could not be opened.' })
    })
    return () => manager.restart()
  }, [manager])

  useEffect(() => {
    if (!notebook || saveState === 'loading') return
    notebookRef.current = notebook
    if (!workspaceOpened.current) { workspaceOpened.current = true; return }
    const generation = ++saveGeneration.current
    setSaveState('dirty')
    const timeout = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (saveGeneration.current !== generation) return
        setSaveState('saving')
        try {
          const latest = notebookRef.current ?? notebook
          const next = { ...latest, updatedAt: new Date().toISOString() }
          const items = await saveWorkspaceNotebook(next)
          if (saveGeneration.current === generation) { setNotebooks(items); setSaveState('saved') }
        } catch {
          if (saveGeneration.current === generation) setSaveState('error')
        }
      })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [notebook]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('calculus-theme', theme)
  }, [theme])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  }, [])

  const setCurrent = useCallback((updater: (current: NotebookDocument) => NotebookDocument) => {
    setSaveState('dirty')
    setNotebook((current) => {
      if (!current) return current
      const next = updater(current)
      notebookRef.current = next
      return next
    })
  }, [])

  const applyRemoteNotebook = useCallback((document: NotebookDocument) => {
    try { const parsed = parseNotebook(document); setNotebook(parsed); setActiveCellId(parsed.cells[0]?.id); setToast({ tone: 'success', message: 'Cloud version applied.' }) }
    catch { setToast({ tone: 'error', message: 'The cloud returned an invalid notebook.' }) }
  }, [])

  const patchCell = (id: string, patch: Partial<NotebookCell>, sourceChanged = false) => {
    setCurrent((current) => {
      const dependents = sourceChanged ? dependentCellIds(current.cells, id, patch.source) : new Set<string>()
      return {
        ...current,
        cells: current.cells.map((cell) => {
          if (cell.id === id) return { ...cell, ...patch, ...(sourceChanged ? { status: 'idle' as const } : {}) }
          if (sourceChanged && dependents.has(cell.id) && cell.outputs.length) return { ...cell, status: 'stale' as const }
          return cell
        }),
      }
    })
  }

  const addCell = (afterId: string | null, kind: CellKind, language?: KernelLanguage) => {
    if (!notebook) return
    const cell = createCell(kind, language ?? notebook.defaultLanguage)
    setCurrent((current) => {
      const index = afterId ? current.cells.findIndex((item) => item.id === afterId) + 1 : current.cells.length
      const cells = [...current.cells]; cells.splice(index, 0, cell)
      return { ...current, cells }
    })
    setActiveCellId(cell.id)
  }

  const deleteCell = (id: string) => setCurrent((current) => {
    if (current.cells.length === 1) return { ...current, cells: [{ ...current.cells[0], source: '', outputs: [], status: 'idle' }] }
    const index = current.cells.findIndex((cell) => cell.id === id)
    const cells = current.cells.filter((cell) => cell.id !== id)
    setActiveCellId(cells[Math.min(index, cells.length - 1)]?.id)
    return { ...current, cells }
  })

  const duplicateCell = (id: string) => setCurrent((current) => {
    const index = current.cells.findIndex((cell) => cell.id === id)
    const copy = { ...current.cells[index], id: crypto.randomUUID(), status: 'idle' as const, executionCount: undefined, outputs: [] }
    const cells = [...current.cells]; cells.splice(index + 1, 0, copy); setActiveCellId(copy.id)
    return { ...current, cells }
  })

  const executeCell = async (cell: NotebookCell) => {
    if (cell.kind !== 'code' || !cell.source.trim() || cell.status === 'running') return
    const language = cell.language ?? notebook?.defaultLanguage ?? 'math'
    const count = ++executionCount.current[language]
    patchCell(cell.id, { status: 'queued', outputs: [] })
    await Promise.resolve()
    patchCell(cell.id, { status: 'running', executionCount: count })
    setKernelState((current) => ({ ...current, [language]: { phase: 'busy', message: `Running cell ${count}` } }))
    const result = await manager.execute(language, cell.source)
    const error = result.outputs.some((output) => output.type === 'error')
    patchCell(cell.id, { status: error ? 'error' : 'success', outputs: result.outputs, executionCount: count })
    setVariables((current) => ({ ...current, [language]: result.variables }))
    setKernelState((current) => ({ ...current, [language]: { phase: error ? 'error' : 'ready', message: error ? 'Last run failed' : `${language === 'python' ? 'Python' : 'Math'} ready` } }))
  }

  const runCell = (id: string) => {
    const cell = notebook?.cells.find((item) => item.id === id)
    if (cell) void executeCell(cell)
  }

  const runAndAdvance = async (id: string) => {
    const cell = notebook?.cells.find((item) => item.id === id)
    if (!cell || !notebook) return
    await executeCell(cell)
    const index = notebook.cells.findIndex((item) => item.id === id)
    const next = notebook.cells[index + 1]
    if (next) setActiveCellId(next.id)
    else addCell(id, 'code', cell.language)
  }

  const runAll = async () => {
    if (!notebook || notebook.cells.some((cell) => cell.status === 'running')) return
    for (const cell of notebook.cells) if (cell.kind === 'code' && cell.source.trim()) await executeCell(cell)
  }

  const interrupt = (language: KernelLanguage) => {
    manager.interrupt(language)
    setKernelState((current) => ({ ...current, [language]: { phase: 'ready', message: 'Execution interrupted' } }))
  }

  const restart = (language?: KernelLanguage) => {
    manager.restart(language)
    executionCount.current = language ? { ...executionCount.current, [language]: 0 } : { math: 0, python: 0 }
    if (!language || language === 'math') setVariables((current) => ({ ...current, math: [] }))
    if (!language || language === 'python') setVariables((current) => ({ ...current, python: [] }))
    setCurrent((current) => ({ ...current, cells: current.cells.map((cell) => cell.kind === 'code' && (!language || cell.language === language) ? { ...cell, status: cell.outputs.length ? 'stale' : 'idle' } : cell) }))
    setToast({ tone: 'success', message: language ? `${language === 'python' ? 'Python' : 'Math'} kernel restarted.` : 'All kernels restarted.' })
  }

  const createNewNotebook = async (language: KernelLanguage = 'math') => {
    const created = createNotebook('Untitled notebook', language)
    notebookRef.current = created
    setNotebook(created); setActiveCellId(created.cells[0].id); setSaveState('saving'); manager.restart()
    try { setNotebooks(await saveWorkspaceNotebook(created)); setSaveState('saved') }
    catch { setSaveState('error'); setToast({ tone: 'error', message: 'The new notebook could not be saved.' }) }
  }

  const selectNotebook = async (id: string) => {
    const selected = await loadWorkspaceNotebook(id)
    if (!selected) { setToast({ tone: 'error', message: 'That notebook is no longer available.' }); return }
    manager.restart(); executionCount.current = { math: 0, python: 0 }; setNotebook(selected); setActiveCellId(selected.cells[0]?.id)
  }

  const copyNotebook = async () => {
    if (!notebook) return
    const copy = duplicateNotebook(notebook)
    setNotebooks(await saveWorkspaceNotebook(copy)); setNotebook(copy); setActiveCellId(copy.cells[0]?.id)
    setToast({ tone: 'success', message: 'Notebook duplicated.' })
  }

  const deleteNotebook = async (id: string) => {
    let items = await removeWorkspaceNotebook(id)
    if (!items.length) { const replacement = createNotebook(); items = await saveWorkspaceNotebook(replacement) }
    const next = await loadWorkspaceNotebook(items[0].id)
    setNotebooks(items); setNotebook(next ?? null); setActiveCellId(next?.cells[0]?.id); setDeleteCandidate(null)
    setToast({ tone: 'success', message: 'Notebook deleted.' })
  }

  const importFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const json = JSON.parse(String(reader.result))
        const imported = file.name.toLowerCase().endsWith('.ipynb') ? fromJupyter(json, file.name) : parseNotebook(json)
        imported.id = crypto.randomUUID(); imported.updatedAt = new Date().toISOString()
        setNotebooks(await saveWorkspaceNotebook(imported)); setNotebook(imported); setActiveCellId(imported.cells[0]?.id)
        setToast({ tone: 'success', message: `Imported ${file.name}.` })
      } catch (cause) {
        setToast({ tone: 'error', message: cause instanceof Error ? cause.message : 'This notebook could not be imported.' })
      }
    }
    reader.onerror = () => setToast({ tone: 'error', message: 'The selected file could not be read.' })
    reader.readAsText(file)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setCurrent((current) => {
      const oldIndex = current.cells.findIndex((cell) => cell.id === active.id)
      const newIndex = current.cells.findIndex((cell) => cell.id === over.id)
      return { ...current, cells: arrayMove(current.cells, oldIndex, newIndex) }
    })
  }

  const askCalculus = (query: string) => {
    const result = interpretQuery(query)
    if (!result) { setToast({ tone: 'error', message: 'Try a conversion, derivative, integral, equation, plot, or scientific constant.' }); return }
    const note = createCell('text', result.language, `### ${result.title}\n\n${result.explanation}`)
    const code = createCell('code', result.language, result.code)
    setCurrent((current) => {
      const index = Math.max(0, current.cells.findIndex((cell) => cell.id === activeCellId) + 1)
      const cells = [...current.cells]; cells.splice(index, 0, note, code)
      return { ...current, cells }
    })
    setActiveCellId(code.id)
    window.setTimeout(() => void executeCell(code), 0)
  }

  const updateWidget = async (cellId: string, name: string, value: number) => {
    const result = await manager.execute('math', `${name} = ${value}`)
    setVariables((current) => ({ ...current, math: result.variables }))
    if (!notebook) return
    const dependents = dependentCellIds(notebook.cells, cellId)
    setCurrent((current) => ({ ...current, cells: current.cells.map((cell) => dependents.has(cell.id) && cell.outputs.length ? { ...cell, status: 'stale' } : cell) }))
    for (const cell of notebook.cells) if (dependents.has(cell.id)) await executeCell(cell)
  }

  const searchMatches = notebookSearch ? (notebook?.cells ?? []).filter((cell) => cell.source.toLowerCase().includes(notebookSearch.toLowerCase())) : []
  const visitSearchMatch = () => {
    if (!searchMatches.length) return
    const cell = searchMatches[searchCursor % searchMatches.length]
    setActiveCellId(cell.id); document.querySelector(`[data-cell-id="${cell.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSearchCursor((current) => (current + 1) % searchMatches.length)
  }

  const filteredNotebooks = notebooks.filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const busy = notebook?.cells.some((cell) => cell.status === 'running' || cell.status === 'queued') ?? false
  const activeLanguages = (['math', 'python'] as KernelLanguage[]).filter((language) => notebook?.cells.some((cell) => cell.language === language))

  const paletteCommands: PaletteCommand[] = notebook ? [
    { id: 'math', label: 'Add math cell', description: 'Insert a symbolic computation below', run: () => addCell(activeCellId ?? null, 'code', 'math') },
    { id: 'python', label: 'Add Python cell', description: 'Insert a Python 3 computation below', run: () => addCell(activeCellId ?? null, 'code', 'python') },
    { id: 'text', label: 'Add text cell', description: 'Insert a Markdown explanation below', run: () => addCell(activeCellId ?? null, 'text') },
    { id: 'run', label: 'Run all cells', description: 'Evaluate the notebook from top to bottom', shortcut: '⇧↵', run: () => void runAll() },
    { id: 'restart', label: 'Restart kernels', description: 'Clear all live variables and execution state', run: () => restart() },
    { id: 'theme', label: `Use ${theme === 'dark' ? 'light' : 'dark'} theme`, description: 'Change the notebook appearance', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'print', label: 'Print notebook', description: 'Open the system print or PDF dialog', run: () => window.print() },
    { id: 'new', label: 'New notebook', description: 'Create a blank local notebook', run: () => void createNewNotebook() },
  ] : []

  if (!notebook) return (
    <div className="boot-screen" role="status"><Sigma size={28} /><div><strong>Opening your workspace</strong><span>{saveState === 'error' ? 'Storage is unavailable. Reload to try again.' : 'Restoring notebooks and kernels…'}</span></div></div>
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#notebook">Skip to notebook</a>
      <header className="topbar">
        <div className="brand"><Sigma size={21} strokeWidth={2.2} /><span>Calculus</span></div>
        <div className="document-title">
          <input value={notebook.title} maxLength={240} onChange={(event) => setCurrent((current) => ({ ...current, title: event.target.value || 'Untitled notebook' }))} aria-label="Notebook title" />
          <span className={`save-state save-${saveState}`}>{saveState === 'saved' ? <><Check size={13} /> Saved</> : saveState === 'error' ? <><WifiOff size={13} /> Save failed</> : saveState === 'saving' ? 'Saving…' : 'Edited'}</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" title="Command palette (Ctrl + K)"><CommandIcon size={15} /></button>
          <button className="ask-button" onClick={() => setPaletteOpen(true)}><Sparkles size={15} /> Ask</button>
          <button className="icon-button" onClick={() => setSyncOpen(true)} aria-label="Open cloud sync" title="Cloud sync"><Cloud size={15} /></button>
          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
          <div className="export-menu">
            <button className="quiet-button"><Download size={15} /> Export <ChevronDown size={13} /></button>
            <div className="export-popover"><button onClick={() => downloadNotebook(notebook)}><FileJson size={15} /> Calculus notebook</button><button onClick={() => downloadIpynb(notebook)}><BookOpen size={15} /> Jupyter notebook</button></div>
          </div>
          <button className="run-button" onClick={() => busy ? activeLanguages.forEach(interrupt) : void runAll()}>{busy ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />} {busy ? 'Stop' : 'Run all'}</button>
        </div>
      </header>

      <aside className="workspace-sidebar">
        <button className="new-notebook" onClick={() => void createNewNotebook()}><FilePlus2 size={16} /> New notebook</button>
        <label className="sidebar-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find notebooks" aria-label="Find notebooks" /></label>
        <nav aria-label="Notebooks" className="notebook-list">
          <p className="sidebar-heading">Notebooks</p>
          {filteredNotebooks.length ? filteredNotebooks.map((item) => (
            <div className={`notebook-nav-row ${item.id === notebook.id ? 'active' : ''}`} key={item.id}>
              <button className="nav-item" onClick={() => void selectNotebook(item.id)}><BookOpen size={15} /><span><strong>{item.title}</strong><small>{item.cellCount} cells · {formatDate(item.updatedAt)}</small></span></button>
              {deleteCandidate === item.id ? <div className="delete-confirm"><button onClick={() => void deleteNotebook(item.id)}>Delete</button><button onClick={() => setDeleteCandidate(null)} aria-label="Cancel delete"><X size={13} /></button></div> : <button className="sidebar-delete" onClick={() => setDeleteCandidate(item.id)} aria-label={`Delete ${item.title}`}><Trash2 size={13} /></button>}
            </div>
          )) : <div className="sidebar-empty">No notebooks match “{search}”.</div>}
        </nav>
        <button className="nav-item import-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /><span>Import notebook</span></button>
        <input ref={fileInputRef} hidden type="file" accept=".json,.ipynb,.calc.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.currentTarget.value = '' }} />
        <div className="sidebar-foot">
          <span className={`kernel-dot phase-${kernelState[notebook.defaultLanguage].phase}`} />
          <div><strong>{notebook.defaultLanguage === 'python' ? 'Python 3' : 'Math.js'} kernel</strong><small>{kernelState[notebook.defaultLanguage].message}</small></div>
          <button onClick={() => restart(notebook.defaultLanguage)} aria-label="Restart active kernel"><RefreshCw size={13} /></button>
        </div>
      </aside>

      <main className="notebook-scroll" id="notebook">
        <div className="notebook-header">
          <div><h1>{notebook.title}</h1><p>{notebook.cells.length} {notebook.cells.length === 1 ? 'cell' : 'cells'} · {notebook.defaultLanguage === 'python' ? 'Python and mathematical computing' : 'Local mathematical computing'}</p></div>
          <div className="notebook-header-tools"><label className="notebook-find"><Search size={13} /><input value={notebookSearch} onChange={(event) => { setNotebookSearch(event.target.value); setSearchCursor(0) }} onKeyDown={(event) => event.key === 'Enter' && visitSearchMatch()} placeholder="Find in notebook" aria-label="Find in notebook" />{notebookSearch && <button onClick={visitSearchMatch}>{searchMatches.length ? `${(searchCursor % searchMatches.length) + 1}/${searchMatches.length}` : '0/0'}</button>}</label><label className="language-control">New cells <select value={notebook.defaultLanguage} onChange={(event) => setCurrent((current) => ({ ...current, defaultLanguage: event.target.value as KernelLanguage }))}><option value="math">Math</option><option value="python">Python</option></select></label></div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={notebook.cells.map((cell) => cell.id)} strategy={verticalListSortingStrategy}>
            <section className="notebook" aria-label="Notebook cells">
              {notebook.cells.map((cell, index) => <NotebookCellView
                key={cell.id} cell={cell} index={index} active={activeCellId === cell.id} onActivate={() => setActiveCellId(cell.id)}
                onChange={(source) => patchCell(cell.id, { source }, true)} onRun={() => runCell(cell.id)} onRunAndAdvance={() => void runAndAdvance(cell.id)}
                onInterrupt={() => interrupt(cell.language ?? notebook.defaultLanguage)} onDelete={() => deleteCell(cell.id)} onDuplicate={() => duplicateCell(cell.id)}
                onAddAfter={(kind) => addCell(cell.id, kind, cell.language)} onLanguage={(language) => patchCell(cell.id, { language, status: 'stale' })}
                onToggleOutput={() => patchCell(cell.id, { collapsed: !cell.collapsed })}
                onWidgetChange={(name, value) => void updateWidget(cell.id, name, value)}
                completions={[
                  ...completionCatalog[cell.language ?? notebook.defaultLanguage].map((item) => ({ label: item.label, detail: item.detail, apply: item.template ?? item.label, type: item.label.startsWith('import ') ? 'keyword' : 'function' })),
                  ...variables[cell.language ?? notebook.defaultLanguage].map((variable) => ({ label: variable.name, detail: variable.type ?? 'variable', type: 'variable' })),
                ]}
              />)}
              <button className="append-cell" onClick={() => addCell(notebook.cells.at(-1)?.id ?? null, 'code')}><Plus size={16} /> Add a cell</button>
            </section>
          </SortableContext>
        </DndContext>
      </main>

      <aside className="inspector">
        <section>
          <div className="inspector-title"><Variable size={16} /><h2>Variables</h2></div>
          {activeLanguages.flatMap((language) => variables[language].map((variable) => ({ ...variable, language }))).length ? (
            <dl className="variable-list">{activeLanguages.flatMap((language) => variables[language].map((variable) => <div key={`${language}-${variable.name}`}><dt>{variable.name}<small>{language}</small></dt><dd title={variable.value}>{variable.value}<small>{variable.type}</small></dd></div>))}</dl>
          ) : <p className="empty-copy">Run an assignment to inspect its value and type here.</p>}
        </section>
        <section>
          <div className="inspector-title"><Sigma size={16} /><h2>Quick reference</h2></div>
          <div className="reference-list"><code>sqrt(2)</code><code>derivative('x^2', 'x')</code><code>plot(sin(x), x, 0, 2*pi)</code><code>import sympy as sp</code><code>import pandas as pd</code></div>
        </section>
        <section className="shortcut-list"><h2>Keyboard</h2><p><kbd>Shift</kbd><kbd>Enter</kbd><span>Run and advance</span></p><p><kbd>Ctrl</kbd><kbd>Enter</kbd><span>Run in place</span></p><p><kbd>Alt</kbd><kbd>Enter</kbd><span>Insert below</span></p></section>
        <button className="restart-button" onClick={() => restart()}><RefreshCw size={14} /> Restart all kernels</button>
        <button className="duplicate-notebook" onClick={() => void copyNotebook()}><Copy size={14} /> Duplicate notebook</button>
        <button className="duplicate-notebook" onClick={() => window.print()}><Printer size={14} /> Print or save PDF</button>
      </aside>

      <CommandPalette open={paletteOpen} commands={paletteCommands} onAsk={askCalculus} onClose={() => setPaletteOpen(false)} />
      {syncOpen && <SyncPanel notebook={notebook} onRemote={applyRemoteNotebook} onClose={() => setSyncOpen(false)} />}
      {toast && <div className={`toast ${toast.tone ?? ''}`} role="status"><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={14} /></button></div>}
    </div>
  )
}
