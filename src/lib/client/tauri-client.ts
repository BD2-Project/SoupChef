import { invoke } from '@tauri-apps/api/core'

import { buildPlugins, buildTables, buildTypes, columnType } from '../catalog'
import type { PluginInfo, QueryResult, TableInfo, TypeInfo, Value } from '../types/contract'
import type { SoupClient } from './client'
import { extractPlan, withJsonPlan } from './explain'

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

function toError(error: unknown): WireError {
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    return error as WireError
  }
  return { kind: 'DriverError', message: String(error) }
}

function toQueryResult(result: WireResult, plan: ReturnType<typeof extractPlan>): QueryResult {
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

    const counts: Record<string, number> = {}
    await Promise.all(
      tables.map(async ([name]) => {
        counts[String(name)] = await this.count(String(name))
      }),
    )
    return buildTables(tables, columns, indexes, counts)
  }

  /** Plugins cargados (SysPlugins) + opciones declaradas por sus índices. */
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins =
      (await this.tryRows('SELECT plugin_name, version, api_version, enabled FROM SysPlugins')) ?? []
    const declared =
      (await this.tryRows('SELECT plugin_name, capabilities_json FROM SysIndexes WHERE plugin_name IS NOT NULL')) ?? []
    return buildPlugins(plugins, declared)
  }

  /** Registro de tipos del wire v1.1 (SysTypes): nombre, encoding y tamaño. */
  async listTypes(): Promise<TypeInfo[]> {
    return buildTypes((await this.tryRows('SELECT type_name, plugin_name, encoding, size FROM SysTypes')) ?? [])
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
