
import { errorResponse } from '../../../lib/server/soupdb/http'
import { connectionFor } from '../../../lib/server/soupdb/sessions'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ kind: 'ClientError', message: 'JSON inválido' }, { status: 400 })
  }

  const action = (body as { action?: unknown } | null)?.action
  const connection = connectionFor(locals.sessionId)

  try {
    switch (action) {
      case 'begin':
        await connection.begin()
        break
      case 'commit':
        await connection.commit()
        break
      case 'rollback':
        await connection.rollback()
        break
      default:
        return Response.json({ kind: 'ClientError', message: 'Acción de transacción inválida' }, { status: 400 })
    }
    return Response.json({ ok: true, inTransaction: connection.inTransaction })
  } catch (error) {
    return errorResponse(error)
  }
}
