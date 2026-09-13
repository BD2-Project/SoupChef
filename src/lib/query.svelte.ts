import { client } from './client'
import type { QueryResult, TableInfo } from './types/contract'

class QueryState {
  sql = $state('SELECT * FROM papers WHERE id = 42;')
  running = $state(false)
  // raw: los resultados llegan a 100 000 filas y solo se reemplazan, nunca se mutan.
  result = $state.raw<QueryResult | null>(null)
  tables = $state.raw<TableInfo[]>([])

  async run(statement: string = this.sql): Promise<void> {
    if (this.running || !statement.trim()) return
    this.running = true
    try {
      this.result = await client.execute(statement)
    } catch (error) {
      this.result = {
        columns: [],
        rows: [],
        affected_rows: 0,
        plan: null,
        error: { kind: 'ClientError', message: error instanceof Error ? error.message : String(error) },
      }
    } finally {
      this.running = false
    }
  }

  async loadTables(): Promise<void> {
    try {
      this.tables = await client.listTables()
    } catch {
      this.tables = []
    }
  }
}

export const query = new QueryState()
