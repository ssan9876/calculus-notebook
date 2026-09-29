// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createNotebook } from './notebook'
import { initializeWorkspace, loadWorkspaceNotebook, removeWorkspaceNotebook, saveWorkspaceNotebook } from './workspace'

describe('workspace storage', () => {
  it('creates a starter workspace and persists additional notebooks', async () => {
    const initial = await initializeWorkspace()
    expect(initial.notebooks).toHaveLength(1)

    const added = createNotebook('Python lab', 'python')
    const summaries = await saveWorkspaceNotebook(added)
    expect(summaries.some((item) => item.title === 'Python lab')).toBe(true)
    expect((await loadWorkspaceNotebook(added.id))?.defaultLanguage).toBe('python')
  })

  it('removes a selected notebook', async () => {
    const notebook = createNotebook('Temporary')
    await saveWorkspaceNotebook(notebook)
    const remaining = await removeWorkspaceNotebook(notebook.id)
    expect(remaining.some((item) => item.id === notebook.id)).toBe(false)
  })
})
