
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

  const sql = (body as { sql?: unknown } | null)?.sql
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return Response.json({ kind: 'ClientError', message: 'Falta la consulta SQL' }, { status: 400 })
  }

  try {
    const outcome = await connectionFor(locals.sessionId).query(sql)
    if (outcome.type === 'result') {
      return Response.json({ columns: outcome.result.columns, rows: outcome.result.rows, affected: 0 })
    }
    return Response.json({ columns: [], rows: [], affected: outcome.affected })
  } catch (error) {
    return errorResponse(error)
  }
}
