import { useMemo, useState } from 'react'
import katex from 'katex'
import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import type { OutputItem, PlotData, TableData, WidgetData } from '../types'

function Plot({ data }: { data: PlotData }) {
  const width = 720, height = 240, pad = 22
  const ys = data.points.map((point) => point.y)
  const extent = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys)), 0.001)
  const xScale = (x: number) => pad + ((x - data.min) / (data.max - data.min)) * (width - pad * 2)
  const yScale = (y: number) => pad + ((extent - y) / (extent * 2)) * (height - pad * 2)
  const path = data.points.map((point, index) => `${index ? 'L' : 'M'} ${xScale(point.x).toFixed(2)} ${yScale(point.y).toFixed(2)}`).join(' ')
  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Plot of ${data.expression}`}>
        <line x1={pad} y1={yScale(0)} x2={width - pad} y2={yScale(0)} className="plot-axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="plot-axis" />
        <path d={path} className="plot-line" />
      </svg>
      <figcaption><span>{data.variable} = {data.min.toFixed(2)}</span><span>{data.expression}</span><span>{data.variable} = {data.max.toFixed(2)}</span></figcaption>
    </figure>
  )
}

function Latex({ value }: { value: string }) {
  const html = useMemo(() => katex.renderToString(value, { throwOnError: false, displayMode: true }), [value])
  return <div className="math-output" dangerouslySetInnerHTML={{ __html: html }} />
}

function Table({ data }: { data: TableData }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ column: number; direction: 1 | -1 } | null>(null)
  const rows = useMemo(() => {
    const filtered = data.rows.filter((row) => !query || row.some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())))
    return sort ? [...filtered].sort((a, b) => String(a[sort.column] ?? '').localeCompare(String(b[sort.column] ?? ''), undefined, { numeric: true }) * sort.direction) : filtered
  }, [data.rows, query, sort])
  const download = () => {
    const csv = [data.columns, ...data.rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'table.csv'; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="table-output">
    <div className="table-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter rows" aria-label="Filter table rows" /><span>{rows.length} of {data.rows.length} rows</span><button onClick={download}><Download size={13} /> CSV</button></div>
    <div className="table-scroll"><table><thead><tr>{data.columns.map((column, index) => <th key={column}><button onClick={() => setSort((current) => current?.column === index ? { column: index, direction: current.direction === 1 ? -1 : 1 } : { column: index, direction: 1 })}>{column}{sort?.column === index && (sort.direction === 1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}</button></th>)}</tr></thead><tbody>{rows.slice(0, 500).map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index}>{String(value ?? '')}</td>)}</tr>)}</tbody></table></div>
    {rows.length > 500 && <p className="table-limit">Showing the first 500 matching rows.</p>}
  </div>
}

function Widget({ data, onChange }: { data: WidgetData; onChange?: (name: string, value: number) => void }) {
  const [value, setValue] = useState(data.value)
  return <div className="widget-output"><label htmlFor={`widget-${data.name}`}>{data.name}</label><input id={`widget-${data.name}`} type="range" min={data.min} max={data.max} step={data.step} value={value} onChange={(event) => { const next = Number(event.target.value); setValue(next); onChange?.(data.name, next) }} /><output>{value}</output><span>{data.min}–{data.max}</span></div>
}

function OutputItemView({ output, onWidgetChange }: { output: OutputItem; onWidgetChange?: (name: string, value: number) => void }) {
  if (output.type === 'latex') return <Latex value={output.data} />
  if (output.type === 'plot') return <Plot data={output.data} />
  if (output.type === 'table') return <Table data={output.data} />
  if (output.type === 'widget') return <Widget data={output.data} onChange={onWidgetChange} />
  if (output.type === 'image') return <img className="rich-image" src={output.data.startsWith('data:') ? output.data : `data:${output.mime};base64,${output.data}`} alt={output.alt ?? 'Generated output'} />
  if (output.type === 'html') return <iframe className="html-output" sandbox="" title="Rich notebook output" srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:13px system-ui;color:#1c1e21;margin:0}table{border-collapse:collapse}th,td{padding:6px 10px;border:1px solid #d9d7d0;text-align:right}th{background:#f1f0ec}</style>${output.data}`} />
  if (output.type === 'error') return (
    <div className="error-output"><strong>{output.data}</strong>{output.traceback && <details><summary>Show traceback</summary><pre>{output.traceback}</pre></details>}</div>
  )
  return <pre className={`plain-output ${output.type === 'stream' && output.name === 'stderr' ? 'stderr' : ''}`}>{output.data}</pre>
}

export function OutputView({ outputs, count, onWidgetChange }: { outputs: OutputItem[]; count?: number; onWidgetChange?: (name: string, value: number) => void }) {
  if (!outputs.length) return null
  const isError = outputs.some((output) => output.type === 'error')
  return (
    <div className={`cell-output ${isError ? 'output-error' : ''}`} aria-live="polite">
      <span className="output-label">{isError ? 'Error' : `Out [${count ?? ' '}]`}</span>
      <div className="output-content">{outputs.map((output, index) => <OutputItemView key={`${output.type}-${index}`} output={output} onWidgetChange={onWidgetChange} />)}</div>
    </div>
  )
}
