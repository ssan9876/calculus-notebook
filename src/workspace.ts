import { openDB, type DBSchema } from 'idb'
import { createStarterNotebook, parseNotebook } from './notebook'
import type { NotebookDocument, NotebookSummary } from './types'

interface CalculusDB extends DBSchema {
  notebooks: { key: string; value: NotebookDocument; indexes: { 'by-updated': string } }
  settings: { key: string; value: { key: string; value: unknown } }
}

const dbPromise = openDB<CalculusDB>('calculus-workspace', 1, {
  upgrade(db) {
    const notebooks = db.createObjectStore('notebooks', { keyPath: 'id' })
    notebooks.createIndex('by-updated', 'updatedAt')
    db.createObjectStore('settings', { keyPath: 'key' })
  },
})

const RECOVERY_KEY = 'calculus-notebook:recovery'
const summarize = (notebook: NotebookDocument): NotebookSummary => ({ id: notebook.id, title: notebook.title, updatedAt: notebook.updatedAt, cellCount: notebook.cells.length })
const sortSummaries = (items: NotebookSummary[]) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

let initializationPromise: Promise<{ notebooks: NotebookSummary[]; active: NotebookDocument }> | null = null

async function openWorkspace(): Promise<{ notebooks: NotebookSummary[]; active: NotebookDocument }> {
  const db = await dbPromise
  const existing = await db.getAll('notebooks')
  if (!existing.length) {
    const legacy = localStorage.getItem('calculus-notebook:v1')
    let first: NotebookDocument
    try { first = legacy ? parseNotebook(JSON.parse(legacy)) : createStarterNotebook() }
    catch { first = createStarterNotebook() }
    await db.put('notebooks', first)
    await db.put('settings', { key: 'activeNotebookId', value: first.id })
    return { notebooks: [summarize(first)], active: first }
  }
  const setting = await db.get('settings', 'activeNotebookId')
  const activeId = typeof setting?.value === 'string' ? setting.value : existing[0].id
  const active = existing.find((notebook) => notebook.id === activeId) ?? existing.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return { notebooks: sortSummaries(existing.map(summarize)), active }
}

export function initializeWorkspace(): Promise<{ notebooks: NotebookSummary[]; active: NotebookDocument }> {
  initializationPromise ??= openWorkspace()
  return initializationPromise
}

export async function saveWorkspaceNotebook(notebook: NotebookDocument): Promise<NotebookSummary[]> {
  const db = await dbPromise
  await db.put('notebooks', notebook)
  await db.put('settings', { key: 'activeNotebookId', value: notebook.id })
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(notebook))
  return listWorkspaceNotebooks()
}

export async function listWorkspaceNotebooks(): Promise<NotebookSummary[]> {
  return sortSummaries((await (await dbPromise).getAll('notebooks')).map(summarize))
}

export async function loadWorkspaceNotebook(id: string): Promise<NotebookDocument | undefined> {
  const db = await dbPromise
  const notebook = await db.get('notebooks', id)
  if (notebook) await db.put('settings', { key: 'activeNotebookId', value: id })
  return notebook
}

export async function removeWorkspaceNotebook(id: string): Promise<NotebookSummary[]> {
  const db = await dbPromise
  await db.delete('notebooks', id)
  return listWorkspaceNotebooks()
}

export async function recoverNotebook(): Promise<NotebookDocument | null> {
  try {
    const value = localStorage.getItem(RECOVERY_KEY)
    return value ? parseNotebook(JSON.parse(value)) : null
  } catch { return null }
}
