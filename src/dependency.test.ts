import { describe, expect, it } from 'vitest'
import { analyzeSource, dependentCellIds, dependencyMap } from './dependency'
import { createCell } from './notebook'

describe('cell dependencies', () => {
  it('finds math definitions and references', () => {
    const symbols = analyzeSource('area = pi * radius^2', 'math')
    expect([...symbols.definitions]).toEqual(['area'])
    expect([...symbols.references]).toContain('radius')
  })

  it('finds Python imports, assignments, and function definitions', () => {
    const symbols = analyzeSource('import numpy as np\ndef scale(x):\n  return x * factor\nvalues = np.array([1])', 'python')
    expect([...symbols.definitions]).toEqual(expect.arrayContaining(['np', 'scale', 'values']))
    expect([...symbols.references]).toContain('factor')
  })

  it('marks only transitive dependents', () => {
    const a = createCell('code', 'math', 'radius = 4')
    const b = createCell('code', 'math', 'area = pi * radius^2')
    const c = createCell('code', 'math', 'area / 2')
    const unrelated = createCell('code', 'math', 'sqrt(2)')
    expect(dependencyMap([a, b, c, unrelated]).get(b.id)).toContain(a.id)
    expect(dependentCellIds([a, b, c, unrelated], a.id)).toEqual(new Set([b.id, c.id]))
  })
})
