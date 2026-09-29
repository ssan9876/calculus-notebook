// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { evaluate, getVariables, resetKernel } from './kernel'

describe('browser math kernel', () => {
  beforeEach(() => resetKernel())

  it('keeps assignments in scope across evaluations', async () => {
    await evaluate('radius = 4')
    const result = await evaluate('pi * radius^2')

    expect(result.some((output) => output.type === 'error')).toBe(false)
    const value = result.find((output) => output.type === 'text' || output.type === 'latex')
    expect(Number(value?.data)).toBeCloseTo(Math.PI * 16)
    expect(getVariables()).toContainEqual(expect.objectContaining({ name: 'radius', value: '4' }))
  })

  it('evaluates user-defined functions', async () => {
    await evaluate('f(x) = sin(x) * exp(-x / 8)')
    const result = await evaluate('f(pi / 2)')

    expect(result.some((output) => output.type === 'error')).toBe(false)
    const value = result.find((output) => output.type === 'text' || output.type === 'latex')
    expect(Number(value?.data)).toBeCloseTo(Math.exp(-Math.PI / 16))
  })

  it('creates finite sampled plot data', async () => {
    const result = await evaluate('plot(sin(x), x, 0, 2 * pi)')

    const plot = result.find((output) => output.type === 'plot')
    expect(plot?.data.points.length).toBe(240)
    expect(plot?.data.points.every(({ y }) => Number.isFinite(y))).toBe(true)
  })

  it('creates a reactive slider and assigns its initial value', async () => {
    const result = await evaluate('slider(amplitude, 0, 10, 0.5, 3)')

    expect(result).toContainEqual(expect.objectContaining({
      type: 'widget',
      data: expect.objectContaining({ name: 'amplitude', min: 0, max: 10, step: 0.5, value: 3 }),
    }))
    expect(getVariables()).toContainEqual(expect.objectContaining({ name: 'amplitude', value: '3' }))
  })

  it('returns readable evaluation errors', async () => {
    const result = await evaluate('unknownThing + 1')

    const error = result.find((output) => output.type === 'error')
    expect(error?.data).toMatch(/undefined symbol/i)
  })
})
