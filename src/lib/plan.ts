import type { PlanNode } from './types/contract'

export type Heat = 0 | 1 | 2 | 3

export interface PlacedNode {
  node: PlanNode
  x: number
  y: number
  cost: number
}

export interface PlacedEdge {
  from: PlacedNode
  to: PlacedNode
  rows: number
}

export interface PlanLayout {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  columns: number
  levels: number
}

export interface PlanLine {
  text: string
  cost: number
}

const format = (value: number) => value.toLocaleString('es-PE')

// Costo propio del operador: el curso evalúa accesos a disco, no milisegundos.
export function nodeCost(node: PlanNode): number {
  return node.disk_reads + node.disk_writes
}

export function maxCost(node: PlanNode): number {
  return node.children.reduce((max, child) => Math.max(max, maxCost(child)), nodeCost(node))
}

export function countNodes(node: PlanNode): number {
  return node.children.reduce((total, child) => total + countNodes(child), 1)
}

export function heatOf(cost: number, max: number): Heat {
  if (cost === 0 || max === 0) return 0
  const ratio = cost / max
  if (ratio >= 0.85) return 3
  if (ratio >= 0.4) return 2
  return 1
}

export function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Formato inspirado en el EXPLAIN ANALYZE de PostgreSQL: un operador por línea, hijos con "->".
export function planLines(root: PlanNode): PlanLine[] {
  const lines: PlanLine[] = []

  const visit = (node: PlanNode, depth: number) => {
    const detail = Object.entries(node.detail)
      .map(([key, value]) => `${key}=${formatDetailValue(value)}`)
      .join(', ')
    const metrics = `filas=${format(node.rows)}, tiempo=${format(node.elapsed_ms)} ms, lect=${format(node.disk_reads)}, escr=${format(node.disk_writes)}`
    const prefix = depth === 0 ? '' : `${'     '.repeat(depth - 1)}  ->  `
    lines.push({ text: `${prefix}${node.op}${detail ? `  (${detail})` : ''}  (${metrics})`, cost: nodeCost(node) })
    for (const child of node.children) visit(child, depth + 1)
  }

  visit(root, 0)
  return lines
}

// Hojas en columnas consecutivas y cada padre centrado sobre sus hijos: alcanza para planes
// Volcano, que son cadenas o árboles con pocas ramas (joins).
export function layoutPlan(root: PlanNode): PlanLayout {
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []
  let nextColumn = 0
  let levels = 0

  const place = (node: PlanNode, depth: number): PlacedNode => {
    levels = Math.max(levels, depth + 1)
    const children = node.children.map((child) => place(child, depth + 1))
    const x =
      children.length === 0 ? nextColumn++ : (children[0].x + children[children.length - 1].x) / 2
    const placed: PlacedNode = { node, x, y: depth, cost: nodeCost(node) }
    nodes.push(placed)
    for (const child of children) edges.push({ from: child, to: placed, rows: child.node.rows })
    return placed
  }

  place(root, 0)
  return { nodes, edges, columns: Math.max(nextColumn, 1), levels }
}

const SUMMARY_KEYS = ['index', 'table', 'key', 'group_by', 'predicate', 'count', 'columns']

export function summarizeDetail(detail: Record<string, unknown>): string {
  const key = SUMMARY_KEYS.find((candidate) => candidate in detail) ?? Object.keys(detail)[0]
  return key === undefined ? '' : `${key}: ${formatDetailValue(detail[key])}`
}
