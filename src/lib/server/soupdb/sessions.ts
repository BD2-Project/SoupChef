import { SoupConnection } from './connection'

const IDLE_MS = 10 * 60 * 1000

interface Session {
  connection: SoupConnection
  lastUsed: number
}

const sessions = new Map<string, Session>()

function newConnection(): SoupConnection {
  // Módulo solo-servidor: se leen en runtime (Docker pasa SOUPDB_HOST/PORT).
  return new SoupConnection({
    host: process.env.SOUPDB_HOST ?? 'engine',
    port: Number(process.env.SOUPDB_PORT ?? 55432),
    version: Number(process.env.SOUPDB_WIRE_VERSION ?? 2),
    timeoutMs: Number(process.env.SOUPDB_TIMEOUT_MS ?? 15_000),
  })
}

/**
 * Conexión TCP asociada a la cookie del navegador. Así BEGIN/COMMIT/ROLLBACK y
 * los prepared statements sobreviven entre requests sin un socket por request.
 */
export function connectionFor(sessionId: string): SoupConnection {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > IDLE_MS) {
      session.connection.close()
      sessions.delete(id)
    }
  }

  let session = sessions.get(sessionId)
  if (!session) {
    session = { connection: newConnection(), lastUsed: now }
    sessions.set(sessionId, session)
  }
  session.lastUsed = now
  return session.connection
}

/** Cierra todas las conexiones (tests / apagado ordenado). */
export function closeAllSessions(): void {
  for (const session of sessions.values()) session.connection.close()
  sessions.clear()
}
