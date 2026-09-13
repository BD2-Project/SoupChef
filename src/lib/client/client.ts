import type { QueryResult, TableInfo } from '../types/contract'

export interface SoupClient {
  listTables(): Promise<TableInfo[]>
  execute(sql: string): Promise<QueryResult>
}
