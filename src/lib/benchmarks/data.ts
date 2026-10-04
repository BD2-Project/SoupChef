import { CsvFormatError, median, parseBenchCsv, type BenchRow } from './csv'

/**
 * Los CSV se empaquetan en tiempo de compilación: la app de escritorio no tiene
 * acceso al repo del motor. `scripts/sync-benchmarks.sh` los copia a `results/`.
 */
const FILES = import.meta.glob('./results/*.csv', { query: '?raw', eager: true, import: 'default' }) as Record<
  string,
  string
>

const NAME = /^(.*?)_(\d{8})_(\d{6})\.csv$/

export interface Measurement {
  technique: string
  operation: string
  datasetSize: number
  /** Mediana entre corridas; con una sola fila por combinación es esa fila. */
  elapsedMs: number
  diskReads: number
  diskWrites: number
  bytesOnDisk: number
  supported: boolean
  runs: number
}

export interface Suite {
  id: string
  label: string
  date: string | null
  techniques: string[]
  operations: string[]
  datasetSizes: number[]
  measurements: Measurement[]
}

/** Archivos que no se pudieron leer, para avisarlo en la interfaz en vez de ocultarlo. */
export interface SuiteProblem {
  file: string
  reason: string
}

const SUITE_LABELS: Record<string, string> = {
  physical_indexes: 'Índices físicos',
  spatial_indexes: 'Índices espaciales',
  postgres_gist: 'PostgreSQL GiST',
  indexes: 'Índices',
  storage: 'Organización de archivos',
}

const TECHNIQUE_LABELS: Record<string, string> = {
  bplus_clustered: 'B+ agrupado',
  bplus_unclustered: 'B+ no agrupado',
  extendible_hash: 'Hash extensible',
  heap_file: 'Heap',
  sequential_file: 'Secuencial',
  rtree: 'R-Tree',
  sequential_scan: 'Búsqueda secuencial',
  postgres_gist: 'PostgreSQL GiST',
}

const OPERATION_LABELS: Record<string, string> = {
  build: 'Construcción',
  equality_fetch: 'Búsqueda exacta',
  range_fetch: 'Búsqueda por rango',
  ordered_fetch: 'Recorrido ordenado',
  mutation_insert: 'Inserción',
  mutation_remove: 'Eliminación',
  radius_search: 'Búsqueda por radio',
  knn: 'k vecinos más cercanos',
}

// Las operaciones espaciales llevan el parámetro en el nombre (`radius_5000m`,
// `knn_50`): se arma la etiqueta en vez de enumerar una por cada valor medido.
const RADIUS_OPERATION = /^radius_(\d+)m$/
const KNN_OPERATION = /^knn_(\d+)$/

export const techniqueLabel = (id: string): string => TECHNIQUE_LABELS[id] ?? id

export function operationLabel(id: string): string {
  const fixed = OPERATION_LABELS[id]
  if (fixed) return fixed

  const radius = RADIUS_OPERATION.exec(id)
  if (radius) {
    const meters = Number(radius[1])
    return `Radio de ${meters >= 1000 ? `${meters / 1000} km` : `${meters} m`}`
  }

  const knn = KNN_OPERATION.exec(id)
  if (knn) return `k-NN, k = ${knn[1]}`

  return id
}

function parseDate(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`
}

/** Agrupa por (técnica, operación, tamaño) y reduce las corridas a su mediana. */
function aggregate(rows: BenchRow[]): Measurement[] {
  const groups = new Map<string, BenchRow[]>()
  for (const row of rows) {
    const key = `${row.technique}\u0000${row.operation}\u0000${row.datasetSize}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return [...groups.values()].map((group) => ({
    technique: group[0].technique,
    operation: group[0].operation,
    datasetSize: group[0].datasetSize,
    elapsedMs: median(group.map((row) => row.elapsedMs)),
    diskReads: median(group.map((row) => row.diskReads)),
    diskWrites: median(group.map((row) => row.diskWrites)),
    bytesOnDisk: median(group.map((row) => row.bytesOnDisk)),
    // Basta que una corrida la marque imposible: la combinación no existe.
    supported: group.every((row) => row.supported),
    runs: group.length,
  }))
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function load(): { suites: Suite[]; problems: SuiteProblem[] } {
  const suites: Suite[] = []
  const problems: SuiteProblem[] = []

  for (const [path, text] of Object.entries(FILES)) {
    const file = path.split('/').pop() ?? path
    const match = NAME.exec(file)
    const id = match ? match[1] : file.replace(/\.csv$/, '')
    try {
      const measurements = aggregate(parseBenchCsv(text))
      if (measurements.length === 0) {
        problems.push({ file, reason: 'no tiene filas de datos' })
        continue
      }
      suites.push({
        id,
        label: SUITE_LABELS[id] ?? id.replace(/_/g, ' '),
        date: match ? parseDate(match[2]) : null,
        techniques: distinct(measurements.map((m) => m.technique)),
        operations: distinct(measurements.map((m) => m.operation)),
        datasetSizes: distinct(measurements.map((m) => m.datasetSize)).sort((a, b) => a - b),
        measurements,
      })
    } catch (error) {
      problems.push({
        file,
        reason: error instanceof CsvFormatError ? error.message : String(error),
      })
    }
  }

  // Más reciente primero: el CSV que acaba de correr es el que se quiere mirar.
  suites.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id))
  return { suites, problems }
}

export const { suites, problems } = load()

/** La comparación 2.2.4 del enunciado: secuencial vs R-Tree vs GiST. */
export const SPATIAL_SUITE = 'spatial_indexes'
export const spatialSuite = suites.find((suite) => suite.id === SPATIAL_SUITE) ?? null

export type MetricId = 'elapsedMs' | 'diskReads' | 'diskWrites' | 'bytesOnDisk'

export interface Metric {
  id: MetricId
  label: string
  unit: string
  format: (value: number) => string
}

const integer = new Intl.NumberFormat('es-PE')

function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  if (value >= 1) return `${value.toFixed(1)} ms`
  return `${value.toFixed(2)} ms`
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${integer.format(value)} B`
}

export const METRICS: Metric[] = [
  { id: 'elapsedMs', label: 'Tiempo', unit: 'ms', format: formatMs },
  { id: 'diskReads', label: 'Lecturas', unit: 'accesos', format: (v) => integer.format(v) },
  { id: 'diskWrites', label: 'Escrituras', unit: 'accesos', format: (v) => integer.format(v) },
  { id: 'bytesOnDisk', label: 'Espacio', unit: 'bytes', format: formatBytes },
]
