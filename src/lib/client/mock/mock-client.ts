import type { SoupClient } from '../client'
import type {
  ColumnType,
  GeoPoint,
  PlanNode,
  PluginInfo,
  QueryResult,
  TableInfo,
  TypeInfo,
  Value,
} from '../../types/contract'
import { euclideanDegrees, haversineMeters, isGeoPoint, parsePolygon } from '../../spatial'
import { isVector } from '../../values'
import { generateRow } from './rows'
import { PLUGINS, TABLES, TYPES } from './tables'

// Latencia simulada para que la UI tenga estados de carga reales antes de integrar rsoup.
const LATENCY_MS = 150
const RECORDS_PER_PAGE = 40
const BPLUS_HEIGHT = 3
const RTREE_HEIGHT = 3
const SORT_BUFFER_PAGES = 16

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const pages = (rows: number) => Math.max(1, Math.ceil(rows / RECORDS_PER_PAGE))

function node(
  op: string,
  detail: Record<string, unknown>,
  rows: number,
  disk_reads: number,
  children: PlanNode[] = [],
  disk_writes = 0,
): PlanNode {
  const childMs = children.reduce((sum, child) => sum + child.elapsed_ms, 0)
  const elapsed_ms = Math.round((childMs + disk_reads * 0.08 + rows * 0.002) * 100) / 100
  return { op, detail, rows, elapsed_ms, disk_reads, disk_writes, children }
}

function ok(
  columns: string[],
  rows: Value[][],
  plan: PlanNode,
  affected_rows = 0,
  columnTypes?: ColumnType[],
): QueryResult {
  return { columns, columnTypes, rows, affected_rows, plan, error: null }
}

/** Tipos de las columnas proyectadas, para que la tabla muestre VECTOR/score. */
function projectionTypes(table: TableInfo, names: string[], projection: string[]): ColumnType[] {
  return projection.map((name) => table.columns[names.indexOf(name)]?.type ?? 'TEXT')
}

function fail(kind: string, message: string): QueryResult {
  return { columns: [], rows: [], affected_rows: 0, plan: null, error: { kind, message } }
}

function findTable(name: string): TableInfo | undefined {
  return TABLES.find((table) => table.name === name.toLowerCase())
}

function compare(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

// --- Almacén con overlay: INSERT/DELETE se reflejan en las búsquedas ---------
//
// Las tablas base son generadores deterministas (no hay motor detrás). Para que
// la demo de "el DML mantiene el índice" sea real en el navegador, el mock
// guarda las filas insertadas y los ids borrados encima de lo generado.

const insertedRows = new Map<string, Value[][]>()
const deletedIds = new Map<string, Set<number>>()

function baseRows(table: TableInfo): Value[][] {
  return Array.from({ length: table.row_count }, (_, i) => generateRow(table.name, i))
}

function allRows(table: TableInfo): Value[][] {
  const deleted = deletedIds.get(table.name)
  const base = deleted ? baseRows(table).filter((row) => !deleted.has(Number(row[0]))) : baseRows(table)
  return [...base, ...(insertedRows.get(table.name) ?? [])]
}

function hasOverlay(table: TableInfo): boolean {
  return deletedIds.has(table.name) || insertedRows.has(table.name)
}

function nextId(table: TableInfo): number {
  return allRows(table).reduce((max, row) => Math.max(max, Number(row[0]) || 0), 0) + 1
}

/** Separa una lista por comas de nivel superior, respetando comillas y paréntesis. */
function splitList(list: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  for (let i = 0; i < list.length; i++) {
    const char = list[i]
    if (char === "'") {
      if (inString && list[i + 1] === "'") {
        current += "''"
        i++
        continue
      }
      inString = !inString
      current += char
      continue
    }
    if (!inString) {
      if (char === '(') depth++
      else if (char === ')') depth--
      else if (char === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseLiteral(token: string): Value {
  const text = token.trim()
  if (/^NULL$/i.test(text)) return null
  if (/^TRUE$/i.test(text)) return true
  if (/^FALSE$/i.test(text)) return false
  const point = /^POINT\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i.exec(text)
  if (point) return { x: Number(point[2]), y: Number(point[1]) }
  if (/^[+-]?\d+$/.test(text)) return Number(text)
  if (/^[+-]?\d*\.\d+$/.test(text)) return Number(text)
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text
}

function toSqlLiteral(value: Value): string {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  if (isGeoPoint(value)) return `POINT(${value.y}, ${value.x})`
  if (isVector(value)) return `(${value.join(', ')})`
  return 'NULL'
}

function bindParams(sql: string, params: Value[]): string {
  return sql.replace(/\$(\d+)/g, (_, index: string) => toSqlLiteral(params[Number(index) - 1] ?? null))
}

// --- Búsqueda de plugins (SEARCH ... USING ... WITH ...) --------------------

interface RankedQuery {
  column: string
  expression: string
  plugin: string
  options: Record<string, string | number>
}

const SEARCH_CALL = /SEARCH\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)\s+USING\s+(\w+)(?:\s+WITH\s*\(([^)]*)\))?/i
const SCORE_ITEM = /^SCORE\s*\(\s*\)$/i

function parseOptions(raw: string | undefined): Record<string, string | number> {
  const options: Record<string, string | number> = {}
  if (!raw) return options
  for (const part of raw.split(',')) {
    const [key, value] = part.split('=').map((piece) => piece.trim())
    if (!key || value === undefined) continue
    const unquoted = value.replace(/^'(.*)'$/, '$1')
    options[key.toLowerCase()] = /^-?\d+(\.\d+)?$/.test(unquoted) ? Number(unquoted) : unquoted
  }
  return options
}

function parseRanked(sql: string): RankedQuery | null {
  const match = SEARCH_CALL.exec(sql)
  if (!match) return null
  const [, column, expression, plugin, rawOptions] = match
  return { column, expression, plugin: plugin.toUpperCase(), options: parseOptions(rawOptions) }
}

/** TF normalizado: cuántas veces aparece cada término de la consulta. */
function textScore(text: string, terms: string[]): number {
  const haystack = text.toLowerCase()
  const hits = terms.reduce((total, term) => {
    let count = 0
    let from = 0
    while (true) {
      const at = haystack.indexOf(term, from)
      if (at < 0) break
      count++
      from = at + term.length
    }
    return total + count
  }, 0)
  return hits / Math.max(1, terms.length)
}

function dot(a: number[], b: number[]): number {
  return a.reduce((total, value, index) => total + value * (b[index] ?? 0), 0)
}

function norm(vector: number[]): number {
  return Math.sqrt(dot(vector, vector))
}

function cosine(a: number[], b: number[]): number {
  const denominator = norm(a) * norm(b)
  return denominator === 0 ? 0 : dot(a, b) / denominator
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((total, value, index) => total + (value - (b[index] ?? 0)) ** 2, 0))
}

function unitRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function hash(text: string): number {
  let seed = 17
  for (const char of text) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  return seed
}

/** Vector de consulta para una expresión arbitraria (demo sin modelo real). */
function pseudoVector(expression: string, dimension: number): number[] {
  const seed = hash(expression)
  return Array.from({ length: dimension }, (_, index) =>
    Number((unitRandom(seed + index * 17) * 2 - 1).toFixed(3)),
  )
}

function projectionNames(selectList: string, names: string[]): string[] | null {
  const items = splitList(selectList)
  if (items.includes('*')) return names
  const projection: string[] = []
  for (const item of items) {
    if (SCORE_ITEM.test(item)) continue
    if (!names.includes(item)) return null
    projection.push(item)
  }
  return projection
}

function rankedQuery(table: TableInfo, names: string[], selectList: string, rest: string): QueryResult | null {
  const ranked = parseRanked(`${selectList} ${rest}`)
  if (!ranked) return null

  const columnIndex = names.indexOf(ranked.column)
  if (columnIndex < 0) {
    return fail('ColumnNotFound', `La columna "${ranked.column}" no existe en ${table.name}`)
  }

  const projection = projectionNames(selectList, names)
  if (!projection) return fail('ColumnNotFound', 'La consulta selecciona una columna inexistente')

  const selectsScore = splitList(selectList).some((item) => SCORE_ITEM.test(item))
  const rows = allRows(table)
  const order = /ORDER\s+BY\s+SCORE\s*\(\s*\)\s*(ASC|DESC)?/i.exec(rest)?.[1]?.toUpperCase()
  const limit = Number(/LIMIT\s+(\d+)/i.exec(rest)?.[1] ?? Number.NaN)
  const k = Number(ranked.options.k ?? (Number.isFinite(limit) ? limit : 10))

  // Índice que respalda la búsqueda: en vectorial puede vivir sobre otra
  // columna (`embedding`) distinta de la multimedia buscada (`archivo`).
  const index =
    table.indexes.find((candidate) => candidate.plugin === ranked.plugin && candidate.column === ranked.column) ??
    table.indexes.find((candidate) => candidate.plugin === ranked.plugin)

  let candidates: { row: Value[]; score: number }[]

  if (ranked.plugin === 'INVERTED') {
    const terms = ranked.expression.toLowerCase().split(/\s+/).filter(Boolean)
    candidates = rows
      .map((row) => ({ row, score: textScore(String(row[columnIndex] ?? ''), terms) }))
      .filter((entry) => entry.score > 0)
  } else if (ranked.plugin === 'IVF' || ranked.plugin === 'HNSW') {
    const metric = String(ranked.options.metric ?? 'cosine').toLowerCase()
    const vectorColumn = index?.column ?? ranked.column
    const vectorIndex = names.indexOf(vectorColumn)
    if (vectorIndex < 0) {
      return fail('ColumnNotFound', `El plugin ${ranked.plugin} no tiene una columna vectorial en ${table.name}`)
    }

    const firstVector = rows.map((row) => row[vectorIndex]).find(isVector)
    const dimension = firstVector?.length ?? 8
    // La expresión puede ser el nombre corto ("foto-03.jpg") o la ruta completa.
    const needle = ranked.expression.toLowerCase()
    const source = rows.find((row) =>
      row.some((value) => typeof value === 'string' && value.toLowerCase().includes(needle)),
    )
    const target = source && isVector(source[vectorIndex])
      ? source[vectorIndex]
      : pseudoVector(ranked.expression, dimension)
    candidates = rows
      .filter((row) => row !== source)
      .flatMap((row) => {
        const vector = row[vectorIndex]
        if (!isVector(vector)) return []
        const score = metric === 'euclidean' ? 1 / (1 + euclidean(vector, target)) : cosine(vector, target)
        return [{ row, score }]
      })
  } else {
    return fail('Unsupported', `El mock no implementa el plugin ${ranked.plugin}`)
  }

  const sorted = candidates.sort((a, b) => b.score - a.score)
  if (order === 'ASC') sorted.reverse()
  const top = Number.isFinite(limit) ? sorted.slice(0, Math.min(k, limit)) : sorted.slice(0, k)

  const output = top.map(({ row, score }) => {
    const values = projection.map((name) => row[names.indexOf(name)])
    if (selectsScore) values.push(Math.round(score * 1000) / 1000)
    return values
  })

  const leaf = node(
    'RankedSearch',
    {
      plugin: ranked.plugin,
      index: index?.name ?? `${table.name}_${ranked.column}`,
      column: ranked.column,
      query: ranked.expression,
      k,
      ...(ranked.options.method === undefined ? {} : { method: ranked.options.method }),
      ...(ranked.options.metric === undefined ? {} : { metric: ranked.options.metric }),
      candidates: candidates.length,
    },
    output.length,
    pages(output.length) + 2,
  )
  const plan = node(
    'Project',
    { columns: [...projection, ...(selectsScore ? ['score'] : [])].join(', ') },
    output.length,
    0,
    [leaf],
  )
  const types = projectionTypes(table, names, projection)
  return ok(
    [...projection, ...(selectsScore ? ['score'] : [])],
    output,
    plan,
    0,
    [...types, ...(selectsScore ? (['FLOAT'] as ColumnType[]) : [])],
  )
}

// --- SELECT -----------------------------------------------------------------

function select(statement: string): QueryResult {
  const match = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(.*)$/is.exec(statement)
  if (!match) return fail('SyntaxError', 'Se esperaba SELECT <columnas> FROM <tabla>')

  const [, selectList, tableName, rest] = match
  const table = findTable(tableName)
  if (!table) return fail('TableNotFound', `La tabla "${tableName}" no existe`)

  const names = table.columns.map((column) => column.name)

  const ranked = rankedQuery(table, names, selectList, rest)
  if (ranked) return ranked

  const groupBy = /GROUP\s+BY\s+(\w+)/i.exec(rest)?.[1]
  if (groupBy) return aggregate(table, groupBy)

  const polygonal = polygonQuery(table, names, selectList, rest)
  if (polygonal) return polygonal

  const spatial = spatialQuery(table, names, selectList, rest)
  if (spatial) return spatial

  const projection = selectList.trim() === '*' ? names : selectList.split(',').map((s) => s.trim())
  const missing = projection.find((name) => !names.includes(name))
  if (missing) return fail('ColumnNotFound', `La columna "${missing}" no existe en ${table.name}`)

  const source = allRows(table)
  const pk = /WHERE\s+id\s*=\s*(\d+)/i.exec(rest)?.[1]
  const orderBy = /ORDER\s+BY\s+(\w+)(\s+DESC)?/i.exec(rest)
  const limit = Number(/LIMIT\s+(\d+)/i.exec(rest)?.[1] ?? source.length)

  let rows: Value[][]
  let plan: PlanNode

  if (pk !== undefined) {
    const id = Number(pk)
    rows = source.filter((row) => Number(row[0]) === id)
    const index = table.indexes.find((candidate) => candidate.column === 'id')
    plan = node(
      'IndexScan',
      { index: index?.kind ?? 'none', table: table.name, predicate: `id = ${id}` },
      rows.length,
      BPLUS_HEIGHT + rows.length,
    )
  } else if (orderBy) {
    const [, column, desc] = orderBy
    const position = names.indexOf(column)
    if (position < 0) return fail('ColumnNotFound', `La columna "${column}" no existe en ${table.name}`)

    // Se ordena la tabla completa y recién después se corta: ORDER BY precede a LIMIT.
    const total = source.length
    const direction = desc ? -1 : 1
    rows = [...source].sort((a, b) => compare(a[position], b[position]) * direction).slice(0, limit)

    const scan = node('SeqScan', { table: table.name, organization: table.organization }, total, pages(total))
    plan = node(
      'ExternalSort',
      { key: column, order: desc ? 'DESC' : 'ASC', runs: Math.ceil(pages(total) / SORT_BUFFER_PAGES) },
      total,
      pages(total) * 2,
      [scan],
      pages(total),
    )
    if (rows.length < total) plan = node('Limit', { count: limit }, rows.length, 0, [plan])
  } else {
    // El LIMIT puede superar row_count para probar la UI con 100 000 filas, pero
    // solo cuando no hay DML aplicado: con overlay manda el contenido real.
    rows = source.slice(0, limit)
    if (!hasOverlay(table) && limit > source.length) {
      const extra = Array.from({ length: limit - source.length }, (_, i) => generateRow(table.name, source.length + i))
      rows = [...rows, ...extra]
    }
    plan = node('SeqScan', { table: table.name, organization: table.organization }, rows.length, pages(rows.length))
  }

  const positions = projection.map((name) => names.indexOf(name))
  const projected = rows.map((row) => positions.map((position) => row[position]))
  plan = node('Project', { columns: projection.join(', ') }, projected.length, 0, [plan])
  return ok(projection, projected, plan, 0, projectionTypes(table, names, projection))
}

/**
 * `distancia(columna, POINT(lat, lon))`, o `distance(...)`, con la métrica
 * opcional como tercer argumento. Es la forma del enunciado (2.2.3): el literal
 * lleva la latitud primero y el GeoPoint guarda x = longitud, y = latitud.
 */
const DISTANCE_CALL =
  /dist(?:ance|ancia)\s*\(\s*(\w+)\s*,\s*POINT\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*(?:,\s*'(\w+)'\s*)?\)/i

interface SpatialTarget {
  column: string
  center: GeoPoint
  metric: 'haversine' | 'euclidiana'
}

function parseDistanceCall(sql: string): SpatialTarget | null {
  const match = DISTANCE_CALL.exec(sql)
  if (!match) return null
  const [, column, latitude, longitude, metricName] = match
  return {
    column,
    center: { x: Number(longitude), y: Number(latitude) },
    // Sin tercer argumento el motor usa la euclidiana, que mide en grados.
    metric: metricName?.toLowerCase() === 'haversine' ? 'haversine' : 'euclidiana',
  }
}

function distanceTo(center: GeoPoint, metric: SpatialTarget['metric']) {
  return (point: GeoPoint) =>
    metric === 'haversine' ? haversineMeters(center, point) : euclideanDegrees(center, point)
}

/** `intersects(columna, POLYGON(...))`: punto en polígono. */
const INTERSECTS = /intersects\s*\(\s*(\w+)\s*,\s*POLYGON/i

/**
 * Punto en polígono por ray casting sobre los vértices.
 *
 * La frontera se considera incluida, igual que en el motor.
 */
function inside(point: GeoPoint, vertices: GeoPoint[]): boolean {
  let hit = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]
    const b = vertices[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit
    }
  }
  return hit
}

/** Consultas de intersección con polígono; devuelve null si no aplica. */
function polygonQuery(
  table: TableInfo,
  names: string[],
  selectList: string,
  rest: string,
): QueryResult | null {
  const sql = `${selectList} ${rest}`
  const call = INTERSECTS.exec(sql)
  const vertices = parsePolygon(sql)
  if (!call || !vertices) return null

  const column = call[1]
  const position = names.indexOf(column)
  if (position < 0) {
    return fail('ColumnNotFound', `La columna "${column}" no existe en ${table.name}`)
  }
  if (table.columns[position].type !== 'POINT') {
    return fail('TypeError', `La columna "${column}" no es espacial`)
  }

  const projection =
    selectList.trim() === '*' ? names : selectList.split(',').map((name) => name.trim())
  const unknown = projection.find((name) => !names.includes(name))
  if (unknown) return fail('ColumnNotFound', `La columna "${unknown}" no existe en ${table.name}`)
  const positions = projection.map((name) => names.indexOf(name))

  const rows = allRows(table)
  const selected = rows.filter((row) => {
    const point = row[position]
    return isGeoPoint(point) && inside(point, vertices)
  })

  // El MBR del polígono poda antes de la prueba exacta, igual que en el motor.
  const leaf = node(
    'SpatialPolygonScan',
    { index: `${table.name}_geo`, table: table.name, vertices: vertices.length },
    selected.length,
    RTREE_HEIGHT + pages(selected.length),
  )
  const projected = selected.map((row) => positions.map((index) => row[index]))
  const plan = node('Project', { columns: projection.join(', ') }, projected.length, 0, [leaf])
  return ok(projection, projected, plan, 0, projectionTypes(table, names, projection))
}

/** Consultas por radio y k-NN sobre una columna POINT; devuelve null si no aplica. */
function spatialQuery(
  table: TableInfo,
  names: string[],
  selectList: string,
  rest: string,
): QueryResult | null {
  const target = parseDistanceCall(`${selectList} ${rest}`)
  if (!target) return null

  const position = names.indexOf(target.column)
  if (position < 0) {
    return fail('ColumnNotFound', `La columna "${target.column}" no existe en ${table.name}`)
  }
  if (table.columns[position].type !== 'POINT') {
    return fail('TypeError', `La columna "${target.column}" no es espacial`)
  }

  const rows = allRows(table)
  const distance = distanceTo(target.center, target.metric)
  const measured = rows
    .map((row) => {
      const point = row[position]
      return { row, distance: isGeoPoint(point) ? distance(point) : Number.POSITIVE_INFINITY }
    })
    .sort((a, b) => a.distance - b.distance)

  const radius = /dist(?:ance|ancia)\s*\([^;]*?\)\s*<=?\s*(-?[\d.]+)/i.exec(rest)?.[1]
  const limit = /LIMIT\s+(\d+)/i.exec(rest)?.[1]
  const projection =
    selectList.trim() === '*' ? names : selectList.split(',').map((name) => name.trim())
  const unknown = projection.find((name) => !names.includes(name))
  if (unknown) return fail('ColumnNotFound', `La columna "${unknown}" no existe en ${table.name}`)
  const positions = projection.map((name) => names.indexOf(name))

  let selected: typeof measured
  let leaf: PlanNode

  if (radius !== undefined) {
    const meters = Number(radius)
    // Estricto, no inclusivo: `radius_search` del motor usa `<=`, pero el `<` del SQL
    // excluye el punto que cae justo sobre el radio. Ver docs/integracion_sql_espacial.md.
    selected = measured.filter((entry) => entry.distance < meters)
    // El R-Tree poda por MBR: se visitan pocas páginas frente al scan completo.
    leaf = node(
      'RTreeRangeSearch',
      {
        index: 'lugares_geo',
        table: table.name,
        center: `${target.center.y}, ${target.center.x}`,
        radius_m: meters,
        metric: target.metric,
      },
      selected.length,
      RTREE_HEIGHT + pages(selected.length),
    )
  } else {
    const k = Number(limit ?? 10)
    selected = measured.slice(0, k)
    leaf = node(
      'RTreeKNN',
      {
        index: 'lugares_geo',
        table: table.name,
        k,
        center: `${target.center.y}, ${target.center.x}`,
        metric: target.metric,
      },
      selected.length,
      RTREE_HEIGHT + Math.ceil(k / 4),
    )
  }

  const projected = selected.map(({ row }) => positions.map((index) => row[index]))
  const plan = node('Project', { columns: projection.join(', ') }, projected.length, 0, [leaf])
  return ok(projection, projected, plan, 0, projectionTypes(table, names, projection))
}

function aggregate(table: TableInfo, column: string): QueryResult {
  const position = table.columns.findIndex((candidate) => candidate.name === column)
  if (position < 0) return fail('ColumnNotFound', `La columna "${column}" no existe en ${table.name}`)

  const counts = new Map<Value, number>()
  const rows = allRows(table)
  for (const row of rows) {
    const key = row[position]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const result: Value[][] = [...counts].sort(([a], [b]) => compare(a, b))
  const scan = node(
    'SeqScan',
    { table: table.name, organization: table.organization },
    rows.length,
    pages(rows.length),
  )
  const plan = node(
    'ExternalHashAggregate',
    { group_by: column, aggregate: 'COUNT(*)', partitions: Math.ceil(pages(rows.length) / SORT_BUFFER_PAGES) },
    result.length,
    pages(rows.length),
    [scan],
    pages(rows.length),
  )
  return ok([column, 'count'], result, plan, 0, [table.columns[position].type, 'INT'])
}

function insert(statement: string): QueryResult {
  const match = /^INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]*)\))?\s+VALUES\s*\((.*)\)$/is.exec(statement)
  if (!match) return fail('SyntaxError', 'Se esperaba INSERT INTO <tabla> VALUES (...)')

  const [, tableName, columnList, valueList] = match
  const table = findTable(tableName)
  if (!table) return fail('TableNotFound', `La tabla "${tableName}" no existe`)

  const names = table.columns.map((column) => column.name)
  const columns = columnList ? splitList(columnList) : names
  const values = splitList(valueList)
  if (values.length !== columns.length) {
    return fail(
      'ColumnCountMismatch',
      `${table.name} espera ${columns.length} valores y se recibieron ${values.length}`,
    )
  }

  const unknown = columns.find((name) => !names.includes(name))
  if (unknown) return fail('ColumnNotFound', `La columna "${unknown}" no existe en ${table.name}`)

  const row: Value[] = table.columns.map(() => null)
  columns.forEach((name, index) => {
    row[names.indexOf(name)] = parseLiteral(values[index])
  })
  if (row[0] === null) row[0] = nextId(table)

  insertedRows.set(table.name, [...(insertedRows.get(table.name) ?? []), row])

  const pluginIndexes = table.indexes.filter((index) => index.plugin).length
  const touched = 1 + table.indexes.length
  const plan = node(
    'Insert',
    {
      table: table.name,
      organization: table.organization,
      indexes: table.indexes.length,
      plugin_indexes: pluginIndexes,
    },
    1,
    touched * BPLUS_HEIGHT,
    [],
    touched,
  )
  return ok([], [], plan, 1)
}

function remove(statement: string): QueryResult {
  const match = /^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/is.exec(statement)
  if (!match) return fail('SyntaxError', 'Se esperaba DELETE FROM <tabla> WHERE <condición>')

  const [, tableName, predicate] = match
  const table = findTable(tableName)
  if (!table) return fail('TableNotFound', `La tabla "${tableName}" no existe`)

  const idIndex = table.columns.findIndex((column) => column.name === 'id')
  let affected: number

  if (predicate) {
    const eq = /^id\s*=\s*(\d+)$/i.exec(predicate.trim())
    if (!eq) return fail('Unsupported', 'El mock solo soporta DELETE ... WHERE id = N')
    const id = Number(eq[1])
    affected = allRows(table).filter((row) => row[idIndex] === id).length
    if (id <= table.row_count) {
      const deleted = deletedIds.get(table.name) ?? new Set<number>()
      deleted.add(id)
      deletedIds.set(table.name, deleted)
    }
    insertedRows.set(
      table.name,
      (insertedRows.get(table.name) ?? []).filter((row) => row[idIndex] !== id),
    )
  } else {
    affected = allRows(table).length
    deletedIds.set(table.name, new Set(baseRows(table).map((row) => Number(row[idIndex]))))
    insertedRows.set(table.name, [])
  }

  const scan = predicate
    ? node(
        'IndexScan',
        { index: table.indexes[0]?.kind ?? 'none', table: table.name, predicate: predicate.trim() },
        affected,
        BPLUS_HEIGHT + 1,
      )
    : node('SeqScan', { table: table.name, organization: table.organization }, affected, pages(affected))

  const pluginIndexes = table.indexes.filter((index) => index.plugin).length
  const plan = node(
    'Delete',
    {
      table: table.name,
      strategy: table.organization === 'sequential' ? 'lazy' : 'tombstone',
      plugin_indexes: pluginIndexes,
    },
    affected,
    0,
    [scan],
    pages(affected),
  )
  return ok([], [], plan, affected)
}

function transaction(keyword: 'BEGIN' | 'END'): QueryResult {
  const op = keyword === 'BEGIN' ? 'BeginTransaction' : 'EndTransaction'
  return ok([], [], node(op, {}, 0, 0))
}

interface PreparedStatement {
  sql: string
  /** Parseos del motor: el plan se compila al preparar y se reutiliza. */
  parses: number
}

export class MockClient implements SoupClient {
  readonly source = 'SoupDB · mock'
  readonly connected = true
  readonly prepared = true

  private statements = new Map<string, PreparedStatement>()

  async listTables(): Promise<TableInfo[]> {
    await delay(LATENCY_MS / 3)
    return TABLES.map((table) => ({ ...structuredClone(table), row_count: allRows(table).length }))
  }

  async listPlugins(): Promise<PluginInfo[]> {
    await delay(LATENCY_MS / 3)
    return structuredClone(PLUGINS)
  }

  async listTypes(): Promise<TypeInfo[]> {
    await delay(LATENCY_MS / 3)
    return structuredClone(TYPES)
  }

  async execute(sql: string): Promise<QueryResult> {
    await delay(LATENCY_MS)
    const trimmed = sql.trim().replace(/;\s*$/, '')
    // Como en PostgreSQL, EXPLAIN ANALYZE ejecuta la consulta pero devuelve el plan medido en lugar de las filas.
    const explain = /^EXPLAIN\s+ANALYZE\s+/i.exec(trimmed)
    const result = this.run(explain ? trimmed.slice(explain[0].length) : trimmed)
    return explain ? { ...result, columns: [], rows: [] } : { ...result, plan: null }
  }

  async prepare(name: string, sql: string): Promise<void> {
    await delay(LATENCY_MS / 3)
    this.statements.set(name, { sql, parses: 1 })
  }

  async executePrepared(name: string, params: Value[]): Promise<QueryResult> {
    await delay(LATENCY_MS)
    const statement = this.statements.get(name)
    if (!statement) throw new Error(`El prepared "${name}" no existe`)
    const result = this.run(bindParams(statement.sql, params))
    return { ...result, plan: null, parse_count: statement.parses }
  }

  async deallocate(name: string): Promise<void> {
    await delay(LATENCY_MS / 3)
    if (!this.statements.delete(name)) throw new Error(`El prepared "${name}" no existe`)
  }

  private run(statement: string): QueryResult {
    const keyword = statement.split(/\s+/, 1)[0]?.toUpperCase() ?? ''

    switch (keyword) {
      case 'SELECT':
        return select(statement)
      case 'INSERT':
        return insert(statement)
      case 'DELETE':
        return remove(statement)
      case 'BEGIN':
      case 'END':
        return transaction(keyword)
      case '':
        return fail('EmptyQuery', 'La consulta está vacía')
      default:
        return fail('SyntaxError', `Sentencia no soportada: ${keyword}`)
    }
  }
}
