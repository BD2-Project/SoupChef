import { client } from './client'
import type { QueryResult, TableInfo } from './types/contract'

class QueryState {
  sql = $state('SELECT * FROM papers WHERE id = 42;')
  running = $state(false)
  // raw: los resultados llegan a 100 000 filas y solo se reemplazan, nunca se mutan.
  result = $state.raw<QueryResult | null>(null)
  tables = $state.raw<TableInfo[]>([])
  // Medido en el cliente: sin EXPLAIN ANALYZE no hay plan del que sacar el tiempo del motor.
  elapsedMs = $state<number | null>(null)

  async run(statement: string = this.sql): Promise<void> {
    if (this.running || !statement.trim()) return
    this.running = true
    const started = performance.now()
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
      this.elapsedMs = Math.round((performance.now() - started) * 100) / 100
      this.running = false
    }
  }

  loadingTables = $state(false)

  async loadTables(): Promise<void> {
    this.loadingTables = true
    try {
      this.tables = await client.listTables()
    } catch {
      this.tables = []
    } finally {
      this.loadingTables = false
    }
  }
}

export const query = new QueryState()
