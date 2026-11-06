import { client } from './client'
import type { PluginInfo, QueryResult, TableInfo, TypeInfo } from './types/contract'

/** Los errores del puente Tauri llegan como `{ kind, message }`, no como Error. */
function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return error instanceof Error ? error.message : String(error)
}

class QueryState {
  sql = $state('SELECT * FROM papers WHERE id = 42;')
  running = $state(false)
  // raw: los resultados llegan a 100 000 filas y solo se reemplazan, nunca se mutan.
  result = $state.raw<QueryResult | null>(null)
  tables = $state.raw<TableInfo[]>([])
  plugins = $state.raw<PluginInfo[]>([])
  types = $state.raw<TypeInfo[]>([])
  // Medido en el cliente: sin EXPLAIN ANALYZE no hay plan del que sacar el tiempo del motor.
  elapsedMs = $state<number | null>(null)
  /** Lo último que se ejecutó: puede ser una selección, no todo el editor. */
  lastStatement = $state('')
  /** Resultado legible de la demo de prepared statements. */
  preparedNote = $state<string | null>(null)

  async run(statement: string = this.sql): Promise<void> {
    if (this.running || !statement.trim()) return
    this.running = true
    this.preparedNote = null
    this.lastStatement = statement
    const started = performance.now()
    try {
      this.result = await client.execute(statement)
    } catch (error) {
      this.result = {
        columns: [],
        rows: [],
        affected_rows: 0,
        plan: null,
        error: { kind: 'ClientError', message: describe(error) },
      }
    } finally {
      this.elapsedMs = Math.round((performance.now() - started) * 100) / 100
      this.running = false
    }

    // El catálogo cambia con el DDL: el panel de archivos y el autocompletado
    // deben reflejar el índice nuevo sin recargar a mano.
    if (!this.result?.error && /^\s*(CREATE|DROP)\s+(INDEX|TABLE)/i.test(statement)) {
      void this.loadTables()
    }
  }

  /**
   * Demo de prepared statements: prepara una consulta con `$1`, la ejecuta dos
   * veces y muestra cuántas veces parseó el motor. El driver reutiliza el plan.
   */
  async runPreparedDemo(): Promise<void> {
    if (this.running || !client.prepared) return
    this.running = true
    this.preparedNote = null
    const name = 'soupchef_demo'
    const sql = 'SELECT id, titulo FROM docs WHERE id = $1'
    this.sql = sql
    const started = performance.now()
    try {
      await client.deallocate(name).catch(() => undefined)
      await client.prepare(name, sql)
      const first = await client.executePrepared(name, [1])
      const second = await client.executePrepared(name, [2])
      if (second.error) {
        this.result = second
      } else {
        this.result = second
        this.lastStatement = sql
        const parses = second.parse_count ?? first.parse_count
        this.preparedNote =
          parses === undefined
            ? 'prepared ejecutado 2 veces'
            : `prepared ejecutado 2 veces · parseos del motor: ${parses} (plan reutilizado)`
      }
    } catch (error) {
      this.result = {
        columns: [],
        rows: [],
        affected_rows: 0,
        plan: null,
        error: { kind: 'ClientError', message: describe(error) },
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
      const [tables, plugins, types] = await Promise.all([
        client.listTables(),
        client.listPlugins(),
        client.listTypes(),
      ])
      this.tables = tables
      this.plugins = plugins
      this.types = types
    } catch {
      this.tables = []
      this.plugins = []
      this.types = []
    } finally {
      this.loadingTables = false
    }
  }
}

export const query = new QueryState()
