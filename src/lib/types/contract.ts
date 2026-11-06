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

// Los tipos nativos del motor, más los que introduce el protocolo v1.1:
// VECTOR como tipo de primera clase y OPAQUE para tipos extensibles que el
// cliente no sabe interpretar (llegan como bytes con su `type_name`).
export type ColumnType = 'INT' | 'FLOAT' | 'VARCHAR' | 'TEXT' | 'BOOL' | 'POINT' | 'VECTOR' | 'OPAQUE'

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

/**
 * Valor de un tipo extensible que el driver no conoce (protocolo v1.1).
 *
 * `type_name` viaja en el header de la columna; el marcador `$opaque` lo
 * distingue de un GeoPoint al cruzar el puente Tauri.
 */
export interface UnknownValue {
  $opaque: true
  type_name: string
  bytes: number[]
}

export interface ColumnInfo {
  name: string
  type: ColumnType
  /** Nombre original del tipo cuando `type` es OPAQUE (p. ej. "GEOHASH_CUSTOM"). */
  typeName?: string
  length?: number
  primary_key: boolean
}

export interface IndexInfo {
  name: string
  kind: string
  column: string
  /** Plugin que mantiene el índice (INVERTED, IVF, HNSW); vacío en los clásicos. */
  plugin?: string
  /** Opciones con las que se creó (`WITH (...)`), decodificadas de options_json. */
  options?: Record<string, unknown>
  /** Capacidades declaradas por el plugin (capabilities_json). */
  capabilities?: Record<string, unknown>
  item_count?: number
}

export interface TableInfo {
  name: string
  organization: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  row_count: number
}

export interface PluginInfo {
  name: string
  version: string
  api_version: number
  enabled: boolean
  /** Nombres de opciones aceptadas en `WITH (...)` (de capabilities_json). */
  options: string[]
}

/** Fila de SysTypes: el registro de tipos que alimenta el wire v1.1. */
export interface TypeInfo {
  name: string
  plugin?: string
  /** 0=native, 1=fixed, 2=variable, 3=opaque. */
  encoding: number
  size: number
}

export type Value = string | number | boolean | null | GeoPoint | number[] | UnknownValue

export interface QueryError {
  kind: string
  message: string
}

export interface QueryResult {
  columns: string[]
  /** Tipo de cada columna, en paralelo a `columns` (protocolo v1.1). */
  columnTypes?: ColumnType[]
  rows: Value[][]
  affected_rows: number
  plan: PlanNode | null
  error: QueryError | null
  /** Parseos del motor durante un EXECUTE de prepared (solo lo reporta el mock). */
  parse_count?: number
}
