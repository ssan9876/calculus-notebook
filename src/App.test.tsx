// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createNotebook } from './notebook'

const stored = createNotebook('Test notebook')
stored.cells[0].source = '2 + 2'

vi.mock('./workspace', () => ({
  initializeWorkspace: vi.fn(async () => ({ notebooks: [{ id: stored.id, title: stored.title, updatedAt: stored.updatedAt, cellCount: 1 }], active: stored })),
  saveWorkspaceNotebook: vi.fn(async () => [{ id: stored.id, title: stored.title, updatedAt: stored.updatedAt, cellCount: 1 }]),
  loadWorkspaceNotebook: vi.fn(async () => stored),
  removeWorkspaceNotebook: vi.fn(async () => []),
}))

vi.mock('./kernels', () => ({
  KernelManager: class {
    execute = vi.fn(async () => ({ outputs: [{ type: 'text', data: '4' }], variables: [] }))
    restart = vi.fn()
    interrupt = vi.fn()
  },
}))

beforeAll(() => {
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) })
})

describe('notebook application', () => {
  it('runs all code cells and displays their output', async () => {
    const App = (await import('./App')).default
    render(<App />)
    const runAll = await screen.findByRole('button', { name: 'Run all' })
    fireEvent.click(runAll)

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
    expect(screen.getByText('Out [1]')).toBeInTheDocument()
  })
})
