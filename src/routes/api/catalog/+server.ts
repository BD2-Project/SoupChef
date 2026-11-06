
import { loadCatalog } from '../../../lib/server/soupdb/catalog'
import { errorResponse } from '../../../lib/server/soupdb/http'
import { connectionFor } from '../../../lib/server/soupdb/sessions'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  try {
    return Response.json(await loadCatalog(connectionFor(locals.sessionId)))
  } catch (error) {
    return errorResponse(error)
  }
}
