import type { QueryResult, TableInfo } from '../types/contract'
import type { SoupClient } from './client'

/**
 * Cliente del navegador: la interfaz funciona, pero no hay motor al otro lado.
 *
 * El motor habla un protocolo binario sobre TCP y un navegador no puede abrir
 * sockets, así que la conexión real solo existe en la aplicación de escritorio,
 * donde el driver rsoup corre del lado de Tauri. En el navegador quedan dos
 * opciones: este cliente, o el mock con `VITE_SOUPCHEF_MOCK=true`.
 */
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
        message:
          'Un navegador no puede abrir sockets TCP contra el motor. Usá la ' +
          'aplicación de escritorio, o VITE_SOUPCHEF_MOCK=true para datos simulados.',
      },
    }
  }
}
