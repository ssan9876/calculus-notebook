// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNotebook, duplicateNotebook, fromJupyter, parseNotebook, toJupyter } from './notebook'

describe('notebook documents', () => {
  it('migrates the original v1 format without losing source', () => {
    const migrated = parseNotebook({
      version: 1,
      title: 'Legacy',
      cells: [{ id: 'one', kind: 'math', source: '2 + 2', status: 'success', output: { text: '4' } }],
    })

    expect(migrated.version).toBe(2)
    expect(migrated.title).toBe('Legacy')
    expect(migrated.cells[0]).toMatchObject({ kind: 'code', language: 'math', source: '2 + 2', outputs: [] })
  })

  it('round-trips code and Markdown through Jupyter format', () => {
    const notebook = createNotebook('Interop', 'python')
    notebook.cells = [
      { id: 'text', kind: 'text', source: '# Notes', status: 'idle', outputs: [] },
      { id: 'code', kind: 'code', language: 'python', source: 'answer = 42', status: 'success', executionCount: 1, outputs: [{ type: 'text', data: '42' }] },
    ]

    const imported = fromJupyter(toJupyter(notebook), 'interop.ipynb')
    expect(imported.title).toBe('interop')
    expect(imported.defaultLanguage).toBe('python')
    expect(imported.cells.map((cell) => cell.source)).toEqual(['# Notes', 'answer = 42'])
  })

  it('duplicates notebooks with independent notebook and cell identities', () => {
    const original = createNotebook('Source')
    const copy = duplicateNotebook(original)

    expect(copy.id).not.toBe(original.id)
    expect(copy.cells[0].id).not.toBe(original.cells[0].id)
    expect(copy.title).toBe('Source copy')
  })

  it('rejects malformed native notebooks', () => {
    expect(() => parseNotebook({ version: 2, title: '', cells: [] })).toThrow()
  })
})
