// Espejo de PlanNode en SoupDB/engine/query/operators.py (contrato congelado).
// `op` es string libre: operadores nuevos se renderizan sin tocar la UI.
export interface PlanNode {
  op: string
  detail: Record<string, unknown>
  rows: number
  elapsed_ms: number
  disk_reads: number
  disk_writes: number
  children: PlanNode[]
}

// Lo que sigue es la propuesta de #3; se ajusta cuando query y rsoup la acuerden.
export type ColumnType = 'INT' | 'FLOAT' | 'VARCHAR' | 'TEXT' | 'BOOL'

export interface ColumnInfo {
  name: string
  type: ColumnType
  length?: number
  primary_key: boolean
}

export interface IndexInfo {
  name: string
  kind: string
  column: string
}

export interface TableInfo {
  name: string
  organization: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  row_count: number
}

export type Value = string | number | boolean | null

export interface QueryError {
  kind: string
  message: string
}

export interface QueryResult {
  columns: string[]
  rows: Value[][]
  affected_rows: number
  plan: PlanNode | null
  error: QueryError | null
}
