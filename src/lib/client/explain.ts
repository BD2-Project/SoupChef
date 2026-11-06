import type { PlanNode, Value } from '../types/contract'

/** `EXPLAIN` sin opciones; el grupo 1 es lo que va entre EXPLAIN y la sentencia. */
const EXPLAIN_PREFIX = /^(\s*EXPLAIN\s+(?:ANALYZE\s+)?)(?!\()/i

/**
 * Pide el plan en JSON cuando la consulta es un `EXPLAIN` sin formato explícito.
 *
 * El panel de plan necesita el árbol estructurado. Si el usuario ya escribió
 * `(FORMAT ...)` se respeta lo que pidió.
 */
export function withJsonPlan(sql: string): string {
  return sql.replace(EXPLAIN_PREFIX, '$1(FORMAT JSON) ')
}

export interface ExplainResult {
  columns: { name: string }[]
  rows: Value[][]
}

/**
 * Lee el árbol del plan de un resultado de `EXPLAIN (FORMAT JSON)`.
 *
 * Devuelve `null` para cualquier otra consulta. Un JSON mal formado tampoco es
 * motivo para fallar: se degrada a mostrar las filas tal cual.
 */
export function extractPlan(result: ExplainResult): PlanNode | null {
  if (result.columns.length !== 1 || result.columns[0].name !== 'QUERY PLAN') return null
  if (result.rows.length !== 1) return null

  const raw = result.rows[0][0]
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlanNode(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isPlanNode(value: unknown): value is PlanNode {
  if (typeof value !== 'object' || value === null) return false
  const node = value as Record<string, unknown>
  return typeof node.op === 'string' && Array.isArray(node.children)
}
