import { columnType } from '../catalog'
import type { PluginInfo, QueryResult, TableInfo, TypeInfo, Value } from '../types/contract'
import type { SoupClient } from './client'
import { extractPlan, withJsonPlan } from './explain'

/** Respuesta cruda de los endpoints SSR (misma forma que el puente Tauri). */
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

interface Catalog {
  tables: TableInfo[]
  plugins: PluginInfo[]
  types: TypeInfo[]
}

class ApiError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function toError(error: unknown): { kind: string; message: string } {
  if (error instanceof ApiError) return { kind: error.kind, message: error.message }
  return {
    kind: 'ConnectionError',
    message: error instanceof Error ? error.message : String(error),
  }
}

function failure(error: { kind: string; message: string }): QueryResult {
  return { columns: [], rows: [], affected_rows: 0, plan: null, error }
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

/**
 * Cliente web: el navegador no puede abrir TCP, así que habla con los endpoints
 * de SvelteKit. El servidor Node mantiene la conexión binaria con el motor.
 */
export class WebClient implements SoupClient {
  readonly source = 'SoupDB · SSR'
  readonly connected = true
  readonly prepared = true

  private catalog: Promise<Catalog> | null = null

  async execute(sql: string): Promise<QueryResult> {
    try {
      const result = await this.request<WireResult>('/api/query', {
        method: 'POST',
        body: JSON.stringify({ sql: withJsonPlan(sql) }),
      })
      // El catálogo cambia con el DDL; QueryState recargará y no debe ver caché.
      if (/^\s*(CREATE|DROP)\s+(INDEX|TABLE)/i.test(sql)) this.catalog = null
      return toQueryResult(result, extractPlan(result))
    } catch (error) {
      return failure(toError(error))
    }
  }

  async prepare(name: string, sql: string): Promise<void> {
    await this.request('/api/prepared', {
      method: 'POST',
      body: JSON.stringify({ action: 'prepare', name, sql }),
    })
  }

  async executePrepared(name: string, params: Value[]): Promise<QueryResult> {
    try {
      const result = await this.request<WireResult>('/api/prepared', {
        method: 'POST',
        body: JSON.stringify({ action: 'execute', name, params }),
      })
      return toQueryResult(result, null)
    } catch (error) {
      return failure(toError(error))
    }
  }

  async deallocate(name: string): Promise<void> {
    await this.request('/api/prepared', {
      method: 'POST',
      body: JSON.stringify({ action: 'deallocate', name }),
    })
  }

  async listTables(): Promise<TableInfo[]> {
    try {
      return (await this.catalogData()).tables
    } catch {
      return []
    }
  }

  async listPlugins(): Promise<PluginInfo[]> {
    try {
      return (await this.catalogData()).plugins
    } catch {
      return []
    }
  }

  async listTypes(): Promise<TypeInfo[]> {
    try {
      return (await this.catalogData()).types
    } catch {
      return []
    }
  }

  async begin(): Promise<void> {
    await this.request('/api/tx', { method: 'POST', body: JSON.stringify({ action: 'begin' }) })
  }

  async commit(): Promise<void> {
    await this.request('/api/tx', { method: 'POST', body: JSON.stringify({ action: 'commit' }) })
  }

  async rollback(): Promise<void> {
    await this.request('/api/tx', { method: 'POST', body: JSON.stringify({ action: 'rollback' }) })
  }

  /** Las tres lecturas del catálogo comparten una sola petición. */
  private catalogData(): Promise<Catalog> {
    if (!this.catalog) {
      this.catalog = this.request<Catalog>('/api/catalog').catch((error: unknown) => {
        this.catalog = null
        throw error
      })
    }
    return this.catalog
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = payload as { kind?: unknown; message?: unknown } | null
      throw new ApiError(
        typeof body?.kind === 'string' ? body.kind : 'ConnectionError',
        typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`,
      )
    }
    return payload as T
  }
}
