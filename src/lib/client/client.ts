import type { QueryResult, TableInfo } from '../types/contract'

export interface SoupClient {
  readonly source: string
  readonly connected: boolean
  listTables(): Promise<TableInfo[]>
  execute(sql: string): Promise<QueryResult>
}
