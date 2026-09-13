import type { QueryResult, TableInfo } from '../types/contract'
import type { SoupClient } from './client'

// Cliente por defecto hasta integrar rsoup: la interfaz funciona, pero no hay motor al otro lado.
export class DisconnectedClient implements SoupClient {
  readonly source = 'SoupDB · sin conexión'
  readonly connected = false

  async listTables(): Promise<TableInfo[]> {
    return []
  }

  async execute(): Promise<QueryResult> {
    return {
      columns: [],
      rows: [],
      affected_rows: 0,
      plan: null,
      error: {
        kind: 'ConnectionError',
        message: 'Sin conexión al motor: el driver rsoup todavía no está integrado',
      },
    }
  }
}
