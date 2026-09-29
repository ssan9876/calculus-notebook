import type { KernelLanguage } from './types'

export interface KnowledgeResult {
  title: string
  language: KernelLanguage
  code: string
  explanation: string
}

const CONSTANTS: Record<string, { value: string; description: string }> = {
  'speed of light': { value: '299792458 m/s', description: 'Exact speed of light in vacuum.' },
  'planck constant': { value: '6.62607015e-34 J*s', description: 'Exact Planck constant.' },
  'gravitational constant': { value: '6.67430e-11 m^3/(kg*s^2)', description: 'CODATA gravitational constant.' },
  'avogadro constant': { value: '6.02214076e23 1/mol', description: 'Exact Avogadro constant.' },
}

export function interpretQuery(input: string): KnowledgeResult | null {
  const query = input.trim()
  let match = query.match(/^convert\s+(.+?)\s+to\s+(.+)$/i)
  if (match) return { title: 'Unit conversion', language: 'math', code: `unit('${match[1].replaceAll("'", "\\'")}').to('${match[2].replaceAll("'", "\\'")}')`, explanation: `Convert ${match[1]} to ${match[2]} using dimensional units.` }
  match = query.match(/^(?:differentiate|derivative of)\s+(.+?)(?:\s+with respect to\s+([A-Za-z_]\w*))?$/i)
  if (match) return { title: 'Differentiate', language: 'math', code: `derivative('${match[1].replaceAll("'", "\\'")}', '${match[2] ?? 'x'}')`, explanation: `Apply symbolic differentiation with respect to ${match[2] ?? 'x'}.` }
  match = query.match(/^(?:integrate|integral of)\s+(.+?)(?:\s+with respect to\s+([A-Za-z_]\w*))?$/i)
  if (match) return { title: 'Integrate', language: 'python', code: `import sympy as sp\n${match[2] ?? 'x'} = sp.symbols('${match[2] ?? 'x'}')\nsp.integrate(${match[1]}, ${match[2] ?? 'x'})`, explanation: `Use SymPy to find an antiderivative with respect to ${match[2] ?? 'x'}.` }
  match = query.match(/^solve\s+(.+?)\s*(?:for\s+([A-Za-z_]\w*))?$/i)
  if (match) {
    const variable = match[2] ?? 'x'; const equation = match[1].includes('=') ? match[1].replace('=', ',') : `${match[1]}, 0`
    return { title: 'Solve equation', language: 'python', code: `import sympy as sp\n${variable} = sp.symbols('${variable}')\nsp.solve(sp.Eq(${equation}), ${variable})`, explanation: `Translate the equation to SymPy and solve for ${variable}.` }
  }
  const constant = CONSTANTS[query.toLowerCase().replace(/^what is (?:the )?/, '')]
  if (constant) return { title: 'Scientific constant', language: 'math', code: `unit('${constant.value}')`, explanation: constant.description }
  match = query.match(/^plot\s+(.+?)(?:\s+from\s+(.+?)\s+to\s+(.+))?$/i)
  if (match) return { title: 'Plot expression', language: 'math', code: `plot(${match[1]}, x, ${match[2] ?? '-10'}, ${match[3] ?? '10'})`, explanation: 'Sample the expression over the requested domain.' }
  return null
}
