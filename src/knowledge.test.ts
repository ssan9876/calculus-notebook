import { describe, expect, it } from 'vitest'
import { interpretQuery } from './knowledge'

describe('local knowledge interpreter', () => {
  it('translates unit conversions without a network request', () => {
    expect(interpretQuery('convert 5 km to miles')).toEqual(expect.objectContaining({
      language: 'math',
      code: "unit('5 km').to('miles')",
    }))
  })

  it('translates symbolic calculus and equations to inspectable cells', () => {
    expect(interpretQuery('derivative of x^3 with respect to x')?.code).toBe("derivative('x^3', 'x')")
    expect(interpretQuery('integrate sin(x) with respect to x')?.code).toContain('sp.integrate(sin(x), x)')
    expect(interpretQuery('solve 2*x + 3 = 7 for x')?.code).toContain('sp.Eq(2*x + 3 , 7)')
  })

  it('knows its boundary', () => {
    expect(interpretQuery('who won a game yesterday')).toBeNull()
  })
})
