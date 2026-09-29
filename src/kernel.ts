import { all, create, type MathJsInstance } from 'mathjs'
import type { KernelVariable, OutputItem, PlotData } from './types'

const math = create(all, {}) as MathJsInstance
let scope = new Map<string, unknown>()

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'Done'
  try {
    return math.format(value, { precision: 14 })
  } catch {
    return String(value)
  }
}

function toLatex(value: unknown): string | undefined {
  try {
    if (value && typeof value === 'object' && 'toTex' in value && typeof value.toTex === 'function') return value.toTex()
    return math.parse(stringify(value)).toTex({ parenthesis: 'keep' })
  } catch {
    return undefined
  }
}

function parsePlot(source: string): PlotData | null {
  const match = source.trim().match(
    /^plot\(\s*(.+?)\s*,\s*([A-Za-z_]\w*)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/s,
  )
  if (!match) return null
  const [, expression, variable, minRaw, maxRaw] = match
  const min = Number(math.evaluate(minRaw, scope))
  const max = Number(math.evaluate(maxRaw, scope))
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new Error('plot range must be two numbers with min < max')
  }
  const compiled = math.compile(expression)
  const points = Array.from({ length: 240 }, (_, index) => {
    const x = min + ((max - min) * index) / 239
    const localScope = new Map(scope)
    localScope.set(variable, x)
    const raw = compiled.evaluate(localScope)
    const y = typeof raw === 'number' ? raw : Number(raw)
    return { x, y }
  }).filter(({ y }) => Number.isFinite(y))
  return { expression, variable, min, max, points }
}

function parseWidget(source: string): OutputItem | null {
  const match = source.trim().match(/^slider\(\s*([A-Za-z_]\w*)\s*,\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/s)
  if (!match) return null
  const [, name, minSource, maxSource, stepSource, valueSource] = match
  const [min, max, step, value] = [minSource, maxSource, stepSource, valueSource].map((part) => Number(math.evaluate(part, scope)))
  if (![min, max, step, value].every(Number.isFinite) || min >= max || step <= 0) throw new Error('slider requires finite min, max, step, and value arguments')
  scope.set(name, value)
  return { type: 'widget', data: { name, min, max, step, value: Math.min(max, Math.max(min, value)) } }
}

export async function evaluate(source: string): Promise<OutputItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 40))
  try {
    const widget = parseWidget(source)
    if (widget) return [widget]
    const plot = parsePlot(source)
    if (plot) return [{ type: 'plot', data: plot }]
    const value = math.evaluate(source, scope)
    const latex = toLatex(value)
    return latex ? [{ type: 'latex', data: latex }] : [{ type: 'text', data: stringify(value) }]
  } catch (cause) {
    return [{ type: 'error', data: cause instanceof Error ? cause.message : String(cause) }]
  }
}

export function resetKernel() {
  scope = new Map<string, unknown>()
}

export function getVariables(): KernelVariable[] {
  return [...scope.entries()]
    .filter(([name]) => !name.startsWith('__'))
    .map(([name, value]) => ({ name, value: stringify(value), type: math.typeOf(value) }))
}
