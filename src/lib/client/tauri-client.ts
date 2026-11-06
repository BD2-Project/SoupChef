import { invoke } from '@tauri-apps/api/core'

import type {
  ColumnInfo,
  ColumnType,
  IndexInfo,
  PlanNode,
  PluginInfo,
  QueryResult,
  TableInfo,
  TypeInfo,
  Value,
} from '../types/contract'
import type { SoupClient } from './client'

/** Forma que devuelven los comandos de Tauri (ver src-tauri/src/driver.rs). */
interface WireColumn {
  name: string
  type_name: string
  encoding: number
  size: number
  length: number
}

interface WireResult {
  columns: WireColumn[]
  rows: Value[][]
  affected: number
}

interface WireError {
  kind: string
  message: string
}

const ORGANIZATIONS: Record<string, string> = {
  HEAP: 'heap',
  SEQUENTIAL: 'sequential',
}

const INDEX_KINDS: Record<string, string> = {
  HASH: 'extendible_hash',
  BTREE: 'bplus_unclustered',
  INVERTED: 'inverted',
  IVF: 'ivf',
  HNSW: 'hnsw',
}

/** Opciones que el frontend conoce aunque el catálogo aún no declare capabilities. */
const PLUGIN_OPTIONS: Record<string, string[]> = {
  INVERTED: ['method', 'k'],
  IVF: ['metric', 'dimension', 'profile', 'k'],
  HNSW: ['metric', 'dimension', 'profile', 'k'],
}

function toError(error: unknown): WireError {
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    return error as WireError
  }
  return { kind: 'DriverError', message: String(error) }
}

const NATIVE_TYPES: ColumnType[] = ['INT', 'FLOAT', 'VARCHAR', 'TEXT', 'BOOL', 'POINT']

/** `type_name` del protocolo v1.1; lo desconocido se marca como OPAQUE. */
function columnType(name: string): ColumnType {
  const upper = name.toUpperCase() as ColumnType
  if (upper === 'VECTOR') return 'VECTOR'
  return NATIVE_TYPES.includes(upper) ? upper : 'OPAQUE'
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function capabilityOptions(capabilities: Record<string, unknown> | undefined): string[] {
  const raw = capabilities?.index_options
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string')
  if (raw && typeof raw === 'object') return Object.keys(raw)
  return []
}

/** `EXPLAIN` sin opciones; el grupo 1 es lo que va entre EXPLAIN y la sentencia. */
const EXPLAIN_PREFIX = /^(\s*EXPLAIN\s+(?:ANALYZE\s+)?)(?!\()/i

/**
 * Pide el plan en JSON cuando la consulta es un `EXPLAIN` sin formato explícito.
 *
 * El panel de plan necesita el árbol estructurado. Si el usuario ya escribió
 * `(FORMAT ...)` se respeta lo que pidió.
 */
function withJsonPlan(sql: string): string {
  return sql.replace(EXPLAIN_PREFIX, '$1(FORMAT JSON) ')
}

/**
 * Lee el árbol del plan de un resultado de `EXPLAIN (FORMAT JSON)`.
 *
 * Devuelve `null` para cualquier otra consulta. Un JSON mal formado tampoco es
 * motivo para fallar: se degrada a mostrar las filas tal cual.
 */
function extractPlan(result: WireResult): PlanNode | null {
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

function toQueryResult(result: WireResult, plan: PlanNode | null): QueryResult {
  return {
    columns: plan ? [] : result.columns.map((column) => column.name),
    columnTypes: plan ? [] : result.columns.map((column) => columnType(column.type_name)),
    rows: plan ? [] : result.rows,
    affected_rows: result.affected,
    plan,
    error: null,
  }
}

export class TauriClient implements SoupClient {
  readonly source = 'SoupDB · rsoup'
  readonly connected = true
  readonly prepared = true

  async execute(sql: string): Promise<QueryResult> {
    try {
      // El motor solo devuelve el árbol estructurado si se lo piden: un EXPLAIN
      // a secas trae el dibujo de texto, que el panel no puede reconstruir.
      const result = await invoke<WireResult>('query_sql', { sql: withJsonPlan(sql) })
      return toQueryResult(result, extractPlan(result))
    } catch (error) {
      const { kind, message } = toError(error)
      return { columns: [], rows: [], affected_rows: 0, plan: null, error: { kind, message } }
    }
  }

  async prepare(name: string, sql: string): Promise<void> {
    await invoke('prepare_sql', { name, sql })
  }

  async executePrepared(name: string, params: Value[]): Promise<QueryResult> {
    try {
      const result = await invoke<WireResult>('execute_sql', { name, params })
      return toQueryResult(result, null)
    } catch (error) {
      const { kind, message } = toError(error)
      return { columns: [], rows: [], affected_rows: 0, plan: null, error: { kind, message } }
    }
  }

  async deallocate(name: string): Promise<void> {
    await invoke('deallocate_sql', { name })
  }

  /** El catálogo del motor es consultable por SQL (SysTables, SysColumns, SysIndexes…). */
  async listTables(): Promise<TableInfo[]> {
    const tables = (await this.tryRows('SELECT table_name, strategy FROM SysTables')) ?? []
    const columns =
      (await this.tryRows('SELECT table_name, column_name, type_name, length FROM SysColumns ORDER BY position')) ?? []
    const indexes = (await this.indexes()) ?? []

    const result: TableInfo[] = []
    for (const [name, strategy] of tables) {
      const tableName = String(name)
      result.push({
        name: tableName,
        organization: ORGANIZATIONS[String(strategy)] ?? String(strategy).toLowerCase(),
        columns: columns
          .filter((row) => row[0] === tableName)
          .map((row): ColumnInfo => {
            const typeName = String(row[2])
            return {
              name: String(row[1]),
              type: columnType(typeName),
              typeName,
              length: Number(row[3]) || undefined,
              primary_key: false,
            }
          }),
        indexes: indexes
          .filter((row) => row[1] === tableName)
          .map((row): IndexInfo => {
            const plugin = row[4] === null || row[4] === undefined ? undefined : String(row[4])
            return {
              name: String(row[0]),
              kind: plugin ? plugin.toLowerCase() : (INDEX_KINDS[String(row[3])] ?? String(row[3]).toLowerCase()),
              column: String(row[2]),
              plugin,
              options: parseJsonObject(row[5]),
              capabilities: parseJsonObject(row[6]),
              item_count: row[7] === null || row[7] === undefined ? undefined : Number(row[7]),
            }
          }),
        row_count: await this.count(tableName),
      })
    }
    return result
  }

  /** Plugins cargados (SysPlugins) + opciones declaradas por sus índices. */
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins =
      (await this.tryRows('SELECT plugin_name, version, api_version, enabled FROM SysPlugins')) ?? []
    const declared =
      (await this.tryRows('SELECT plugin_name, capabilities_json FROM SysIndexes WHERE plugin_name IS NOT NULL')) ?? []

    const options = new Map<string, Set<string>>()
    for (const [name, capabilitiesJson] of declared) {
      const plugin = String(name)
      const set = options.get(plugin) ?? new Set<string>()
      for (const option of capabilityOptions(parseJsonObject(capabilitiesJson))) set.add(option)
      options.set(plugin, set)
    }

    return plugins.map((row): PluginInfo => {
      const name = String(row[0])
      const merged = new Set([...(PLUGIN_OPTIONS[name] ?? []), ...(options.get(name) ?? [])])
      return {
        name,
        version: String(row[1] ?? ''),
        api_version: Number(row[2] ?? 0),
        enabled: Boolean(row[3]),
        options: [...merged],
      }
    })
  }

  /** Registro de tipos del wire v1.1 (SysTypes): nombre, encoding y tamaño. */
  async listTypes(): Promise<TypeInfo[]> {
    const rows = (await this.tryRows('SELECT type_name, plugin_name, encoding, size FROM SysTypes')) ?? []
    return rows.map((row) => ({
      name: String(row[0]),
      plugin: row[1] === null || row[1] === undefined ? undefined : String(row[1]),
      encoding: Number(row[2] ?? 0),
      size: Number(row[3] ?? 0),
    }))
  }

  async begin(): Promise<void> {
    await invoke('begin')
  }

  async commit(): Promise<void> {
    await invoke('commit')
  }

  async rollback(): Promise<void> {
    await invoke('rollback')
  }

  /**
   * `SysIndexes` unificada (plan de plugins §5). Si el gestor aún no expone las
   * columnas de plugin, se degrada a la forma clásica.
   */
  private async indexes(): Promise<Value[][] | null> {
    const rich = await this.tryRows(
      'SELECT index_name, table_name, column_name, index_type, plugin_name, options_json, capabilities_json, item_count FROM SysIndexes',
    )
    if (rich) return rich
    return this.tryRows('SELECT index_name, table_name, column_name, index_type FROM SysIndexes')
  }

  private async rows(sql: string): Promise<Value[][]> {
    return (await this.tryRows(sql)) ?? []
  }

  /** Igual que `rows`, pero conserva el error para degradar sin romper el panel. */
  private async tryRows(sql: string): Promise<Value[][] | null> {
    const result = await this.execute(sql)
    return result.error ? null : result.rows
  }

  private async count(table: string): Promise<number> {
    const rows = await this.rows(`SELECT COUNT(*) FROM ${table}`)
    return Number(rows[0]?.[0] ?? 0)
  }
}
