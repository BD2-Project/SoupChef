import type { PlanNode } from './types/contract'

export type Heat = 0 | 1 | 2 | 3

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
