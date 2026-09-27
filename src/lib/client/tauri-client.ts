import { invoke } from '@tauri-apps/api/core'

import type { ColumnInfo, ColumnType, IndexInfo, QueryResult, TableInfo, Value } from '../types/contract'
import type { SoupClient } from './client'

/** Forma que devuelven los comandos de Tauri (ver src-tauri/src/driver.rs). */
interface WireColumn {
  name: string
  type_code: number
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
}

function toError(error: unknown): WireError {
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    return error as WireError
  }
  return { kind: 'DriverError', message: String(error) }
}

const COLUMN_TYPES: ColumnType[] = ['INT', 'FLOAT', 'VARCHAR', 'TEXT', 'BOOL']

/** SysColumns guarda el tipo como texto; lo desconocido cae en TEXT. */
function columnType(name: string): ColumnType {
  const upper = name.toUpperCase() as ColumnType
  return COLUMN_TYPES.includes(upper) ? upper : 'TEXT'
}

export class TauriClient implements SoupClient {
  readonly source = 'SoupDB · rsoup'
  readonly connected = true

  async execute(sql: string): Promise<QueryResult> {
    try {
      const result = await invoke<WireResult>('query_sql', { sql })
      return {
        columns: result.columns.map((column) => column.name),
        rows: result.rows,
        affected_rows: result.affected,
        // El protocolo v1 no transporta el plan todavía: el parser aún no soporta
        // EXPLAIN ANALYZE (SoupDB #58/#59), así que el panel del plan no aparece.
        plan: null,
        error: null,
      }
    } catch (error) {
      const { kind, message } = toError(error)
      return { columns: [], rows: [], affected_rows: 0, plan: null, error: { kind, message } }
    }
  }

  /** El catálogo del motor es consultable por SQL: SysTables, SysColumns y SysIndexes. */
  async listTables(): Promise<TableInfo[]> {
    const tables = await this.rows('SELECT table_name, strategy FROM SysTables')
    const columns = await this.rows(
      'SELECT table_name, column_name, type_name, length FROM SysColumns ORDER BY position',
    )
    const indexes = await this.rows('SELECT index_name, table_name, column_name, index_type FROM SysIndexes')

    const result: TableInfo[] = []
    for (const [name, strategy] of tables) {
      const tableName = String(name)
      result.push({
        name: tableName,
        organization: ORGANIZATIONS[String(strategy)] ?? String(strategy).toLowerCase(),
        columns: columns
          .filter((row) => row[0] === tableName)
          .map(
            (row): ColumnInfo => ({
              name: String(row[1]),
              type: columnType(String(row[2])),
              length: Number(row[3]) || undefined,
              primary_key: false,
            }),
          ),
        indexes: indexes
          .filter((row) => row[1] === tableName)
          .map(
            (row): IndexInfo => ({
              name: String(row[0]),
              kind: INDEX_KINDS[String(row[3])] ?? String(row[3]).toLowerCase(),
              column: String(row[2]),
            }),
          ),
        row_count: await this.count(tableName),
      })
    }
    return result
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

  private async rows(sql: string): Promise<Value[][]> {
    const result = await this.execute(sql)
    return result.error ? [] : result.rows
  }

  private async count(table: string): Promise<number> {
    const rows = await this.rows(`SELECT COUNT(*) FROM ${table}`)
    return Number(rows[0]?.[0] ?? 0)
  }
}
