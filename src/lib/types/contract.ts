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
export type ColumnType = 'INT' | 'FLOAT' | 'VARCHAR' | 'TEXT' | 'BOOL' | 'POINT'

/**
 * Coordenada geográfica de una columna POINT (Parte 2).
 *
 * `x` es la longitud y `y` la latitud, igual que el `Point(x, y)` del R-Tree del
 * motor. En el SQL del enunciado el literal se escribe al revés —
 * `POINT(latitud, longitud)` — y la conversión ocurre al parsear.
 */
export interface GeoPoint {
  x: number
  y: number
}

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

export type Value = string | number | boolean | null | GeoPoint

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
