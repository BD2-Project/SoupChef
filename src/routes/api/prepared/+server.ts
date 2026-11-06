
import { errorResponse } from '../../../lib/server/soupdb/http'
import { connectionFor } from '../../../lib/server/soupdb/sessions'
import type { WireValue } from '../../../lib/server/soupdb/protocol'
import type { RequestHandler } from './$types'

interface PreparedBody {
  action?: unknown
  name?: unknown
  sql?: unknown
  params?: unknown
}

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: PreparedBody | null
  try {
    body = (await request.json()) as PreparedBody
  } catch {
    return Response.json({ kind: 'ClientError', message: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body?.name === 'string' ? body.name : ''
  if (!name) return Response.json({ kind: 'ClientError', message: 'Falta el nombre del prepared' }, { status: 400 })

  const connection = connectionFor(locals.sessionId)

  try {
    switch (body?.action) {
      case 'prepare': {
        if (typeof body.sql !== 'string' || body.sql.trim().length === 0) {
          return Response.json({ kind: 'ClientError', message: 'Falta el SQL del prepared' }, { status: 400 })
        }
        await connection.prepare(name, body.sql)
        return Response.json({ ok: true })
      }
      case 'execute': {
        const params = Array.isArray(body.params) ? (body.params as WireValue[]) : []
        const outcome = await connection.execute(name, params)
        if (outcome.type === 'result') {
          return Response.json({ columns: outcome.result.columns, rows: outcome.result.rows, affected: 0 })
        }
        return Response.json({ columns: [], rows: [], affected: outcome.affected })
      }
      case 'deallocate': {
        await connection.deallocate(name)
        return Response.json({ ok: true })
      }
      default:
        return Response.json({ kind: 'ClientError', message: 'Acción de prepared inválida' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
