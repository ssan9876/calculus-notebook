import { useEffect, useState } from 'react'
import { Check, Cloud, Copy, History, LogOut, RefreshCw, Share2, X } from 'lucide-react'
import { authenticate, connectLive, listVersions, loadCloudSession, restoreVersion, saveCloudSession, shareNotebook, syncNotebook, type CloudSession, type CloudVersion } from '../cloud'
import type { NotebookDocument } from '../types'

export function SyncPanel({ notebook, onRemote, onClose }: { notebook: NotebookDocument; onRemote: (document: NotebookDocument) => void; onClose: () => void }) {
  const [session, setSession] = useState<CloudSession | null>(() => loadCloudSession())
  const [server, setServer] = useState(session?.server ?? 'http://127.0.0.1:8787')
  const [email, setEmail] = useState(session?.email ?? '')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<CloudVersion[]>([])
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    if (!session) return
    const socket = connectLive(session, notebook.id, onRemote)
    return () => socket.close()
  }, [session, notebook.id, onRemote])

  const run = async (operation: () => Promise<void>) => {
    setError(''); setStatus('Working…')
    try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cloud operation failed.') } finally { setStatus('') }
  }

  if (!session) return <aside className="sync-panel" aria-label="Cloud sync">
    <div className="panel-heading"><div><Cloud size={17} /><h2>{mode === 'login' ? 'Sign in to sync' : 'Create local cloud account'}</h2></div><button onClick={onClose} aria-label="Close sync panel"><X size={15} /></button></div>
    <p>Connect to a Calculus sync server. The default address is the self-hosted service included with this project.</p>
    <label>Server<input value={server} onChange={(event) => setServer(event.target.value)} /></label>
    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
    {error && <div className="panel-error">{error}</div>}
    <button className="panel-primary" disabled={!!status} onClick={() => void run(async () => setSession(await authenticate(server, email, password, mode)))}>{status || (mode === 'login' ? 'Sign in' : 'Create account')}</button>
    <button className="panel-link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Use an existing account'}</button>
  </aside>

  return <aside className="sync-panel" aria-label="Cloud sync">
    <div className="panel-heading"><div><Cloud size={17} /><h2>Cloud sync</h2></div><button onClick={onClose} aria-label="Close sync panel"><X size={15} /></button></div>
    <p>Signed in as <strong>{session.email}</strong></p>
    {error && <div className="panel-error">{error}</div>}{status && <div className="panel-status">{status}</div>}
    <button className="panel-primary" onClick={() => void run(async () => { const result = await syncNotebook(session, notebook); setStatus(`Synced with ${result.versions} saved versions.`); setVersions(await listVersions(session, notebook.id)) })}><RefreshCw size={14} /> Sync now</button>
    <button onClick={() => void run(async () => { const result = await shareNotebook(session, notebook.id); setShareUrl(result.url) })}><Share2 size={14} /> Create share link</button>
    {shareUrl && <div className="share-result"><input readOnly value={shareUrl} /><button onClick={() => void navigator.clipboard.writeText(shareUrl)} aria-label="Copy share link"><Copy size={13} /></button></div>}
    <button onClick={() => void run(async () => setVersions(await listVersions(session, notebook.id)))}><History size={14} /> Load version history</button>
    {versions.length > 0 && <div className="version-list">{versions.map((version) => <div key={version.id}><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</span><button onClick={() => void run(async () => onRemote(await restoreVersion(session, notebook.id, version.id)))}>Restore</button></div>)}</div>}
    <div className="live-status"><Check size={13} /> Live updates connected when this notebook exists in the cloud.</div>
    <button className="panel-link" onClick={() => { saveCloudSession(null); setSession(null) }}><LogOut size={13} /> Sign out</button>
  </aside>
}
