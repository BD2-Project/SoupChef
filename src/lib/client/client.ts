import type { PluginInfo, QueryResult, TableInfo, TypeInfo, Value } from '../types/contract'

export interface SoupClient {
  readonly source: string
  readonly connected: boolean
  /** El driver expone prepared statements (protocolo v1.1). */
  readonly prepared: boolean
  listTables(): Promise<TableInfo[]>
  listPlugins(): Promise<PluginInfo[]>
  listTypes(): Promise<TypeInfo[]>
  execute(sql: string): Promise<QueryResult>
  prepare(name: string, sql: string): Promise<void>
  /** `execute` ya está tomado por las consultas SQL; este ejecuta un prepared. */
  executePrepared(name: string, params: Value[]): Promise<QueryResult>
  deallocate(name: string): Promise<void>
  begin(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}
