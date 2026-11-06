
import { TransportError } from './connection'
import { ProtocolError, ServerError } from './protocol'

const KIND_BY_CODE: Record<number, string> = {
  0x00: 'DriverError',
  0x01: 'ParseError',
  0x02: 'ExecutionError',
  0x03: 'TransactionError',
  0x04: 'LockTimeout',
  0x05: 'Deadlock',
  0x06: 'RecordNotFound',
  0x07: 'ContractViolation',
  0x08: 'Unsupported',
}

/** Traduce errores del driver/socket a la forma `{ kind, message }` del cliente. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ServerError) {
    return Response.json(
      { kind: KIND_BY_CODE[error.code] ?? 'DriverError', message: error.message },
      { status: 500 },
    )
  }
  if (error instanceof TransportError) {
    return Response.json({ kind: 'ConnectionError', message: error.message }, { status: 502 })
  }
  if (error instanceof ProtocolError) {
    return Response.json({ kind: 'DriverError', message: error.message }, { status: 502 })
  }
  return Response.json(
    { kind: 'ClientError', message: error instanceof Error ? error.message : String(error) },
    { status: 500 },
  )
}
