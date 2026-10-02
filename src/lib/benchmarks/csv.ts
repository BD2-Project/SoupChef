/**
 * Lectura de los CSV que produce `benchmarks/harness.py` del motor.
 *
 * El curso fija el encabezado
 * `technique,operation,dataset_size,run,elapsed_ms,disk_reads,disk_writes,bytes_on_disk`,
 * pero los scripts ya escritos usan nombres propios (`structure`, `records`,
 * `size_bytes`). En vez de reescribir los CSV —que son el dato crudo del
 * informe— se aceptan los dos vocabularios mediante alias.
 */

/** Nombres equivalentes por campo, del más específico al más genérico. */
const ALIASES = {
  technique: ['technique', 'structure', 'index'],
  operation: ['operation', 'op'],
  datasetSize: ['dataset_size', 'records', 'n'],
  run: ['run'],
  elapsedMs: ['elapsed_ms'],
  diskReads: ['disk_reads'],
  diskWrites: ['disk_writes'],
  bytesOnDisk: ['bytes_on_disk', 'size_bytes'],
  resultCount: ['result_count'],
  supported: ['supported'],
} as const

export interface BenchRow {
  technique: string
  operation: string
  datasetSize: number
  run: number | null
  elapsedMs: number
  diskReads: number
  diskWrites: number
  bytesOnDisk: number
  resultCount: number | null
  /** `false` marca una combinación imposible, como `range_fetch` en hash extensible. */
  supported: boolean
}

export class CsvFormatError extends Error {}

function splitLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      // Dos comillas seguidas dentro de un campo citado son una comilla literal.
      if (char === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

/** Índice de la primera columna del encabezado que coincide con algún alias. */
function columnOf(header: string[], names: readonly string[]): number {
  for (const name of names) {
    const index = header.indexOf(name)
    if (index >= 0) return index
  }
  return -1
}

function toNumber(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

function toBoolean(raw: string | undefined): boolean {
  // Python escribe `True`/`False`; un CSV escrito a mano puede traer `1`/`0`.
  if (raw === undefined || raw === '') return true
  return !['false', '0', 'no'].includes(raw.toLowerCase())
}

/**
 * Convierte el contenido de un CSV en filas normalizadas.
 *
 * Lanza `CsvFormatError` si al archivo le faltan las columnas que identifican una
 * medición comparable: sin técnica ni operación no hay nada que graficar.
 */
export function parseBenchCsv(text: string): BenchRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) throw new CsvFormatError('el archivo está vacío')

  const header = splitLine(lines[0]).map((name) => name.toLowerCase())
  const at = Object.fromEntries(
    Object.entries(ALIASES).map(([field, names]) => [field, columnOf(header, names)]),
  ) as Record<keyof typeof ALIASES, number>

  const missing = (['technique', 'operation', 'elapsedMs'] as const).filter((field) => at[field] < 0)
  if (missing.length > 0) {
    throw new CsvFormatError(`faltan las columnas ${missing.join(', ')}`)
  }

  return lines.slice(1).map((line) => {
    const cells = splitLine(line)
    return {
      technique: cells[at.technique] ?? '',
      operation: cells[at.operation] ?? '',
      datasetSize: toNumber(cells[at.datasetSize]),
      run: at.run >= 0 ? toNumber(cells[at.run]) : null,
      elapsedMs: toNumber(cells[at.elapsedMs]),
      diskReads: toNumber(cells[at.diskReads]),
      diskWrites: toNumber(cells[at.diskWrites]),
      bytesOnDisk: toNumber(cells[at.bytesOnDisk]),
      resultCount: at.resultCount >= 0 ? toNumber(cells[at.resultCount]) : null,
      supported: toBoolean(cells[at.supported]),
    }
  })
}

/**
 * Mediana, no promedio: el curso la exige porque la primera corrida suele venir
 * contaminada por el cache del sistema operativo y arrastraría el promedio.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
