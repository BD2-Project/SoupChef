import { randomUUID } from 'node:crypto'
import type { Handle } from '@sveltejs/kit/hooks'

const SESSION_COOKIE = 'soupchef_sid'

/**
 * Una conexión TCP (y su transacción) por navegador.
 *
 * El servidor Node es quien habla el protocolo binario; la cookie httpOnly
 * identifica la sesión para que BEGIN/COMMIT/ROLLBACK sobrevivan entre
 * requests sin exponer el socket al cliente.
 */
export const handle: Handle = async ({ event, resolve }) => {
  let sessionId = event.cookies.get(SESSION_COOKIE)
  if (!sessionId) {
    sessionId = randomUUID()
    event.cookies.set(SESSION_COOKIE, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
    })
  }
  event.locals.sessionId = sessionId
  return resolve(event)
}
