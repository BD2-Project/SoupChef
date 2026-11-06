import { Socket } from 'node:net'

import {
  decodeError,
  decodeOk,
  decodeResult,
  encodeDeallocate,
  encodeExecute,
  encodeFrame,
  encodePrepare,
  encodeQuery,
  FrameParser,
  OPCODE,
  ProtocolError,
  ServerError,
  type Frame,
  type QueryOutcome,
  type WireValue,
} from './protocol'

const EMPTY = Buffer.alloc(0)

/** Error de transporte (socket caído, timeout); habilita el reintento. */
export class TransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransportError'
  }
}

export interface ConnectionOptions {
  host: string
  port: number
  version?: number
  timeoutMs?: number
}

interface Pending {
  resolve: (frame: Frame) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Una conexión TCP al gestor. Serializa los requests (el protocolo responde
 * uno por frame) y reconecta una vez si el socket murió fuera de transacción.
 */
export class SoupConnection {
  private readonly host: string
  private readonly port: number
  private readonly version: number
  private readonly timeoutMs: number

  private socket: Socket | undefined
  private connecting: Promise<void> | undefined
  private readonly parser = new FrameParser()
  private pending: Pending | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private transaction = false

  constructor(options: ConnectionOptions) {
    this.host = options.host
    this.port = options.port
    this.version = options.version ?? 0x02
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  get inTransaction(): boolean {
    return this.transaction
  }

  async query(sql: string): Promise<QueryOutcome> {
    return this.withRetry(async () => this.dispatch(await this.roundTrip(OPCODE.QUERY, encodeQuery(sql))))
  }

  async begin(): Promise<void> {
    this.expectOk(await this.roundTrip(OPCODE.BEGIN, EMPTY))
    this.transaction = true
  }

  async commit(): Promise<void> {
    this.expectOk(await this.roundTrip(OPCODE.COMMIT, EMPTY))
    this.transaction = false
  }

  async rollback(): Promise<void> {
    this.expectOk(await this.roundTrip(OPCODE.ROLLBACK, EMPTY))
    this.transaction = false
  }

  async prepare(name: string, sql: string): Promise<void> {
    this.expectOk(await this.roundTrip(OPCODE.PREPARE, encodePrepare(name, sql)))
  }

  async execute(name: string, params: WireValue[]): Promise<QueryOutcome> {
    return this.dispatch(await this.roundTrip(OPCODE.EXECUTE, encodeExecute(name, params)))
  }

  async deallocate(name: string): Promise<void> {
    this.expectOk(await this.roundTrip(OPCODE.DEALLOCATE, encodeDeallocate(name)))
  }

  async ping(): Promise<void> {
    const frame = await this.roundTrip(OPCODE.PING, EMPTY)
    if (frame.opcode !== OPCODE.PONG) {
      throw new ProtocolError(`se esperaba PONG y llegó opcode ${frame.opcode}`)
    }
  }

  close(): void {
    this.reset()
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    // Se captura antes: reset() limpia el flag y un error de socket dentro de
    // una transacción no debe reintentarse silenciosamente.
    const inTransaction = this.transaction
    try {
      return await operation()
    } catch (error) {
      if (error instanceof TransportError && !inTransaction) {
        this.reset(error)
        return operation()
      }
      throw error
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private roundTrip(opcode: number, payload: Buffer): Promise<Frame> {
    return this.enqueue(async () => {
      const socket = await this.ensureConnected()
      return new Promise<Frame>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = undefined
          reject(new TransportError(`timeout de ${this.timeoutMs} ms esperando al gestor`))
          this.reset()
        }, this.timeoutMs)

        this.pending = { resolve, reject, timer }
        socket.write(encodeFrame(opcode, payload, this.version), (error) => {
          if (!error) return
          clearTimeout(timer)
          this.pending = undefined
          reject(new TransportError(error.message))
        })
      })
    })
  }

  private ensureConnected(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket)
    if (!this.connecting) {
      this.connecting = new Promise<void>((resolve, reject) => {
        const socket = new Socket()
        let settled = false
        const timer = setTimeout(() => {
          socket.destroy()
          settle(new TransportError(`timeout conectando a ${this.host}:${this.port}`))
        }, this.timeoutMs)

        const settle = (error?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (error) reject(error)
          else {
            this.socket = socket
            resolve()
          }
        }

        socket.setNoDelay(true)
        socket.once('connect', () => settle())
        socket.on('data', (chunk) => this.onData(chunk))
        socket.on('error', (error) => {
          const transport = new TransportError(`socket: ${error.message}`)
          settle(transport)
          if (this.socket === socket) this.reset(transport)
        })
        socket.on('close', () => {
          if (this.socket === socket) this.reset(new TransportError('conexión cerrada por el gestor'))
        })
        socket.connect(this.port, this.host)
      }).finally(() => {
        this.connecting = undefined
      })
    }

    return this.connecting.then(() => {
      if (!this.socket) throw new TransportError('sin conexión con el gestor')
      return this.socket
    })
  }

  private onData(chunk: Buffer): void {
    let frames: Frame[]
    try {
      frames = this.parser.push(chunk)
    } catch (error) {
      this.reset(error instanceof Error ? error : new ProtocolError(String(error)))
      return
    }

    for (const frame of frames) {
      const pending = this.pending
      if (!pending) continue
      this.pending = undefined
      clearTimeout(pending.timer)
      pending.resolve(frame)
    }
  }

  private dispatch(frame: Frame): QueryOutcome {
    if (frame.opcode === OPCODE.ERROR) {
      const { code, message } = decodeError(frame.payload)
      throw new ServerError(code, message)
    }
    if (frame.opcode === OPCODE.RESULT) {
      return { type: 'result', result: decodeResult(frame.payload, frame.version) }
    }
    if (frame.opcode === OPCODE.OK) {
      return { type: 'ok', affected: decodeOk(frame.payload) }
    }
    throw new ProtocolError(`respuesta inesperada: opcode ${frame.opcode}`)
  }

  private expectOk(frame: Frame): void {
    if (frame.opcode === OPCODE.ERROR) {
      const { code, message } = decodeError(frame.payload)
      throw new ServerError(code, message)
    }
    if (frame.opcode !== OPCODE.OK) {
      throw new ProtocolError(`se esperaba OK y llegó opcode ${frame.opcode}`)
    }
  }

  private reset(error?: Error): void {
    const pending = this.pending
    this.pending = undefined
    if (pending) {
      clearTimeout(pending.timer)
      pending.reject(error ?? new TransportError('conexión reiniciada'))
    }
    this.socket?.destroy()
    this.socket = undefined
    this.transaction = false
  }
}
