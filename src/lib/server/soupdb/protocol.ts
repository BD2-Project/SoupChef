/**
 * Codec del protocolo binario entre SoupChef (servidor Node) y el gestor SoupDB.
 *
 * El gestor responde con la MISMA versión del frame de request. La versión 0x02
 * (v1.1) usa un header de columnas schema-driven; la 0x01 conserva el código
 * numérico de tipo. El ancho de `size` del header v2 cambió entre los codecs
 * Python (u16, el vigente) y Rust (u32, propuesta); el decoder prueba ambos y
 * valida que el payload se consuma por completo.
 */

export const MAGIC = Buffer.from('SP', 'ascii')
export const VERSION_V1 = 0x01
export const VERSION_V2 = 0x02
export const DEFAULT_VERSION = VERSION_V2

export const OPCODE = {
  PING: 0x01,
  PONG: 0x02,
  BEGIN: 0x03,
  COMMIT: 0x04,
  ROLLBACK: 0x05,
  QUERY: 0x06,
  PREPARE: 0x07,
  EXECUTE: 0x08,
  DEALLOCATE: 0x09,
  OK: 0x10,
  RESULT: 0x11,
  ERROR: 0x12,
} as const

export const TAG = {
  NULL: 0x00,
  INT: 0x01,
  FLOAT: 0x02,
  TEXT: 0x03,
  BOOL: 0x04,
  POINT: 0x05,
  /** En v1.1: VECTOR (dim u16 + f64s). El gestor v2 lo usa como BYTES (len u32). */
  VECTOR_OR_BYTES: 0x06,
  OPAQUE: 0x07,
} as const

const TYPE_NAMES: Record<number, string> = {
  0x01: 'INT',
  0x02: 'FLOAT',
  0x03: 'VARCHAR',
  0x04: 'TEXT',
  0x05: 'BOOL',
  0x06: 'POINT',
}

export interface WireColumn {
  name: string
  type_name: string
  encoding: number
  size: number
  length: number
}

export type WireValue =
  | null
  | boolean
  | number
  | string
  | { x: number; y: number }
  | number[]
  | { $opaque: true; type_name: string; bytes: number[] }

export interface WireResult {
  columns: WireColumn[]
  rows: WireValue[][]
}

export type QueryOutcome =
  | { type: 'result'; result: WireResult }
  | { type: 'ok'; affected: number }

export interface Frame {
  version: number
  opcode: number
  payload: Buffer
}

/** Error de framing/decodificación (no viene del gestor). */
export class ProtocolError extends Error {
  readonly code = 0x00

  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

/** Error devuelto por el gestor en un frame ERROR. */
export class ServerError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'ServerError'
  }
}

// --- Frames ----------------------------------------------------------------

export function encodeFrame(
  opcode: number,
  payload: Buffer = Buffer.alloc(0),
  version: number = DEFAULT_VERSION,
): Buffer {
  const header = Buffer.alloc(8)
  MAGIC.copy(header, 0)
  header[2] = version
  header[3] = opcode
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

/** Acumula bytes del socket y entrega frames completos. */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): Frame[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const frames: Frame[] = []

    while (this.buffer.length >= 8) {
      if (this.buffer[0] !== MAGIC[0] || this.buffer[1] !== MAGIC[1]) {
        this.buffer = Buffer.alloc(0)
        throw new ProtocolError('magic distinto de "SP"')
      }
      const version = this.buffer[2]
      if (version !== VERSION_V1 && version !== VERSION_V2) {
        this.buffer = Buffer.alloc(0)
        throw new ProtocolError(`versión de wire desconocida: ${version}`)
      }
      const length = this.buffer.readUInt32BE(4)
      if (this.buffer.length < 8 + length) break

      frames.push({
        version,
        opcode: this.buffer[3],
        payload: this.buffer.subarray(8, 8 + length),
      })
      this.buffer = this.buffer.subarray(8 + length)
    }

    return frames
  }
}

// --- Escritura de payloads -------------------------------------------------

export function encodeQuery(sql: string): Buffer {
  return encodeString32(sql)
}

export function encodePrepare(name: string, sql: string): Buffer {
  return Buffer.concat([encodeString16(name), encodeString32(sql)])
}

export function encodeDeallocate(name: string): Buffer {
  return encodeString16(name)
}

export function encodeExecute(name: string, params: WireValue[]): Buffer {
  const parts: Buffer[] = [encodeString16(name), encodeU16(params.length)]
  for (const param of params) encodeValue(parts, param)
  return Buffer.concat(parts)
}

function encodeValue(parts: Buffer[], value: WireValue): void {
  if (value === null) {
    parts.push(Buffer.from([TAG.NULL]))
    return
  }
  if (typeof value === 'boolean') {
    parts.push(Buffer.from([TAG.BOOL, value ? 1 : 0]))
    return
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647) {
      const buffer = Buffer.alloc(5)
      buffer[0] = TAG.INT
      buffer.writeInt32BE(value, 1)
      parts.push(buffer)
    } else {
      parts.push(encodeF64(TAG.FLOAT, value))
    }
    return
  }
  if (typeof value === 'string') {
    parts.push(Buffer.from([TAG.TEXT]), encodeString16(value))
    return
  }
  if (Array.isArray(value)) {
    // El gestor actual decodifica 0x06 como BYTES en los parámetros: enviar un
    // vector rompería el stream. Se rechaza hasta que soporte TAG_VECTOR.
    throw new ProtocolError('el gestor actual no acepta VECTOR como parámetro de prepared')
  }
  if (typeof value === 'object' && 'x' in value && 'y' in value) {
    const buffer = Buffer.alloc(17)
    buffer[0] = TAG.POINT
    buffer.writeDoubleBE(value.x, 1)
    buffer.writeDoubleBE(value.y, 9)
    parts.push(buffer)
    return
  }
  if (typeof value === 'object' && '$opaque' in value) {
    // El gestor v2 decodifica 0x06 como bytes; 0x07 aún no lo conoce. Usar 0x06
    // mantiene el parámetro utilizable como bytes.
    const bytes = Buffer.from(value.bytes)
    const header = Buffer.alloc(5)
    header[0] = TAG.VECTOR_OR_BYTES
    header.writeUInt32BE(bytes.length, 1)
    parts.push(header, bytes)
    return
  }
  throw new ProtocolError('valor no serializable como parámetro')
}

function encodeU16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16BE(value)
  return buffer
}

function encodeString16(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8')
  return Buffer.concat([encodeU16(bytes.length), bytes])
}

function encodeString32(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  return Buffer.concat([length, bytes])
}

function encodeF64(tag: number, value: number): Buffer {
  const buffer = Buffer.alloc(9)
  buffer[0] = tag
  buffer.writeDoubleBE(value, 1)
  return buffer
}

// --- Lectura de payloads ---------------------------------------------------

class Reader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  get consumed(): boolean {
    return this.offset === this.buffer.length
  }

  u8(): number {
    this.need(1)
    return this.buffer[this.offset++]
  }

  u16(): number {
    this.need(2)
    const value = this.buffer.readUInt16BE(this.offset)
    this.offset += 2
    return value
  }

  u32(): number {
    this.need(4)
    const value = this.buffer.readUInt32BE(this.offset)
    this.offset += 4
    return value
  }

  i32(): number {
    this.need(4)
    const value = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return value
  }

  f64(): number {
    this.need(8)
    const value = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return value
  }

  bytes(length: number): Buffer {
    this.need(length)
    const value = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  string16(): string {
    return this.bytes(this.u16()).toString('utf8')
  }

  private need(length: number): void {
    if (this.offset + length > this.buffer.length) {
      throw new ProtocolError('payload truncado')
    }
  }
}

export function decodeOk(payload: Buffer): number {
  if (payload.length !== 4) throw new ProtocolError('OK debe tener 4 bytes')
  return payload.readUInt32BE(0)
}

export function decodeError(payload: Buffer): { code: number; message: string } {
  const reader = new Reader(payload)
  const code = reader.u8()
  const message = reader.string16()
  return { code, message }
}

export function decodeResult(payload: Buffer, version: number): WireResult {
  if (version === VERSION_V1) return decodeResultV1(payload)

  // v2: primero el ancho del gestor (u16), luego la propuesta de rsoup (u32).
  const fromServer = tryDecodeResultV2(payload, 2)
  if (fromServer) return fromServer
  const fromRsoup = tryDecodeResultV2(payload, 4)
  if (fromRsoup) return fromRsoup
  throw new ProtocolError('header de columnas v2 no reconocido')
}

function tryDecodeResultV2(payload: Buffer, sizeWidth: 2 | 4): WireResult | null {
  try {
    const reader = new Reader(payload)
    const columnCount = reader.u16()
    const columns: WireColumn[] = []
    for (let index = 0; index < columnCount; index++) {
      const name = reader.string16()
      const typeName = reader.string16()
      const encoding = reader.u8()
      const size = sizeWidth === 2 ? reader.u16() : reader.u32()
      const length = reader.u16()
      columns.push({ name, type_name: typeName, encoding, size, length })
    }

    const rowCount = reader.u32()
    // Un ancho equivocado produce conteos absurdos; se descarta la variante.
    if (rowCount > 10_000_000) return null
    const rows: WireValue[][] = []
    for (let row = 0; row < rowCount; row++) {
      const values: WireValue[] = []
      for (const column of columns) values.push(readValue(reader, column))
      rows.push(values)
    }
    if (!reader.consumed) return null
    return { columns, rows }
  } catch {
    return null
  }
}

function decodeResultV1(payload: Buffer): WireResult {
  const reader = new Reader(payload)
  const columnCount = reader.u16()
  const columns: WireColumn[] = []
  for (let index = 0; index < columnCount; index++) {
    const name = reader.string16()
    const typeCode = reader.u8()
    const length = reader.u16()
    columns.push({
      name,
      type_name: TYPE_NAMES[typeCode] ?? 'UNKNOWN',
      encoding: 0,
      size: 0,
      length,
    })
  }

  const rowCount = reader.u32()
  const rows: WireValue[][] = []
  for (let row = 0; row < rowCount; row++) {
    const values: WireValue[] = []
    for (const column of columns) values.push(readValue(reader, column))
    rows.push(values)
  }
  return { columns, rows }
}

function readValue(reader: Reader, column: WireColumn): WireValue {
  const tag = reader.u8()
  switch (tag) {
    case TAG.NULL:
      return null
    case TAG.INT:
      return reader.i32()
    case TAG.FLOAT:
      return reader.f64()
    case TAG.TEXT:
      return reader.string16()
    case TAG.BOOL:
      return reader.u8() !== 0
    case TAG.POINT:
      return { x: reader.f64(), y: reader.f64() }
    case TAG.VECTOR_OR_BYTES: {
      if (column.type_name.toUpperCase() === 'VECTOR') {
        const dimension = reader.u16()
        return Array.from({ length: dimension }, () => reader.f64())
      }
      // El gestor v2 usa 0x06 para bytes opacos (u32 length).
      return opaque(column.type_name, reader.bytes(reader.u32()))
    }
    case TAG.OPAQUE:
      return opaque(column.type_name, reader.bytes(reader.u32()))
    default:
      throw new ProtocolError(`tag de valor desconocido: ${tag}`)
  }
}

function opaque(typeName: string, bytes: Buffer): WireValue {
  return { $opaque: true, type_name: typeName, bytes: [...bytes] }
}
