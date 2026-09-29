import type { KernelLanguage, NotebookCell } from './types'

const COMMON = new Set(['true', 'false', 'null', 'undefined', 'if', 'else', 'for', 'while', 'return', 'in', 'and', 'or', 'not', 'as', 'from', 'import', 'def', 'class', 'lambda', 'const', 'let', 'var'])
const BUILTINS: Record<KernelLanguage, Set<string>> = {
  math: new Set(['sin', 'cos', 'tan', 'sqrt', 'exp', 'log', 'abs', 'plot', 'simplify', 'derivative', 'pi', 'e', 'i']),
  python: new Set(['print', 'len', 'range', 'sum', 'min', 'max', 'abs', 'round', 'list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'True', 'False', 'None']),
}

export interface CellSymbols { definitions: Set<string>; references: Set<string> }

export function analyzeSource(source: string, language: KernelLanguage): CellSymbols {
  const definitions = new Set<string>()
  const references = new Set<string>()
  if (language === 'python') {
    for (const match of source.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)|^\s*class\s+([A-Za-z_]\w*)|^\s*([A-Za-z_]\w*)\s*=(?!=)/gm)) {
      definitions.add(match[1] ?? match[2] ?? match[3])
    }
    for (const match of source.matchAll(/^\s*(?:from\s+\S+\s+import|import)\s+(.+)$/gm)) {
      for (const part of match[1].split(',')) definitions.add((part.match(/\bas\s+(\w+)/)?.[1] ?? part.trim().split('.')[0]).trim())
    }
  } else {
    const assignment = source.match(/^\s*([A-Za-z_]\w*)(?:\s*\([^)]*\))?\s*=(?!=)/m)
    if (assignment) definitions.add(assignment[1])
    const slider = source.match(/^\s*slider\(\s*([A-Za-z_]\w*)\s*,/)
    if (slider) definitions.add(slider[1])
  }
  for (const match of source.matchAll(/\b[A-Za-z_]\w*\b/g)) {
    const name = match[0]
    if (!definitions.has(name) && !COMMON.has(name) && !BUILTINS[language].has(name)) references.add(name)
  }
  return { definitions, references }
}

export function dependencyMap(cells: NotebookCell[]): Map<string, Set<string>> {
  const providers = new Map<string, string>()
  const graph = new Map<string, Set<string>>()
  for (const cell of cells) {
    if (cell.kind !== 'code') continue
    const symbols = analyzeSource(cell.source, cell.language ?? 'math')
    const dependencies = new Set<string>()
    for (const reference of symbols.references) {
      const provider = providers.get(reference)
      if (provider) dependencies.add(provider)
    }
    graph.set(cell.id, dependencies)
    for (const definition of symbols.definitions) providers.set(definition, cell.id)
  }
  return graph
}

export function dependentCellIds(cells: NotebookCell[], changedId: string, nextSource?: string): Set<string> {
  const collect = (sourceCells: NotebookCell[]) => {
    const graph = dependencyMap(sourceCells)
    const dependents = new Set<string>()
    const queue = [changedId]
    while (queue.length) {
      const provider = queue.shift()!
      for (const [cellId, dependencies] of graph) {
        if (!dependents.has(cellId) && dependencies.has(provider)) { dependents.add(cellId); queue.push(cellId) }
      }
    }
    return dependents
  }
  const result = collect(cells)
  if (nextSource !== undefined) for (const id of collect(cells.map((cell) => cell.id === changedId ? { ...cell, source: nextSource } : cell))) result.add(id)
  return result
}

export const completionCatalog: Record<KernelLanguage, Array<{ label: string; detail: string; template?: string }>> = {
  math: [
    { label: 'plot', detail: 'Plot an expression over a range', template: 'plot(expression, x, 0, 10)' },
    { label: 'derivative', detail: 'Differentiate an expression', template: "derivative('x^2', 'x')" },
    { label: 'simplify', detail: 'Simplify a symbolic expression' },
    { label: 'unit', detail: 'Create or convert a physical unit', template: "unit('5 km').to('mi')" },
    { label: 'sqrt', detail: 'Square root' }, { label: 'sin', detail: 'Sine' }, { label: 'cos', detail: 'Cosine' },
  ],
  python: [
    { label: 'print', detail: 'Write to standard output' }, { label: 'range', detail: 'Integer sequence' },
    { label: 'import numpy as np', detail: 'Numerical arrays' }, { label: 'import pandas as pd', detail: 'Data frames' },
    { label: 'import sympy as sp', detail: 'Symbolic mathematics' }, { label: 'import matplotlib.pyplot as plt', detail: 'Plotting' },
  ],
}
