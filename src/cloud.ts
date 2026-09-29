import type { NotebookDocument } from './types'

export interface CloudSession { token: string; email: string; server: string }
export interface CloudVersion { id: string; createdAt: string }
const SESSION_KEY = 'calculus-cloud-session'

export function loadCloudSession(): CloudSession | null {
  try { const value = localStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as CloudSession : null } catch { return null }
}
export function saveCloudSession(session: CloudSession | null) { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY) }

async function request<T>(server: string, path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${server.replace(/\/$/, '')}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Cloud request failed (${response.status}).`)
  return body
}

export async function authenticate(server: string, email: string, password: string, mode: 'login' | 'register') {
  const result = await request<{ token: string; user: { email: string } }>(server, `/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) })
  const session = { token: result.token, email: result.user.email, server }; saveCloudSession(session); return session
}
export const syncNotebook = (session: CloudSession, notebook: NotebookDocument) => request<{ updatedAt: string; versions: number }>(session.server, `/api/notebooks/${notebook.id}`, { method: 'PUT', body: JSON.stringify(notebook) }, session.token)
export const shareNotebook = (session: CloudSession, id: string) => request<{ url: string; token: string }>(session.server, `/api/notebooks/${id}/share`, { method: 'POST' }, session.token)
export const listVersions = (session: CloudSession, id: string) => request<CloudVersion[]>(session.server, `/api/notebooks/${id}/versions`, {}, session.token)
export const restoreVersion = (session: CloudSession, id: string, versionId: string) => request<NotebookDocument>(session.server, `/api/notebooks/${id}/versions/${versionId}/restore`, { method: 'POST' }, session.token)

export function connectLive(session: CloudSession, notebookId: string, onDocument: (document: NotebookDocument) => void) {
  const url = new URL(session.server); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = '/live'; url.searchParams.set('token', session.token); url.searchParams.set('notebook', notebookId)
  const socket = new WebSocket(url)
  socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.type === 'update' && message.document) onDocument(message.document) } catch { /* ignore malformed peers */ } }
  return socket
}
