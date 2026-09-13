import type { SoupClient } from '../client'
import type { PlanNode, QueryResult, TableInfo, Value } from '../../types/contract'
import { generateRow } from './rows'
import { TABLES } from './tables'

// Latencia simulada para que la UI tenga estados de carga reales antes de integrar rsoup.
const LATENCY_MS = 150
const RECORDS_PER_PAGE = 40
const BPLUS_HEIGHT = 3
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

function ok(columns: string[], rows: Value[][], plan: PlanNode, affected_rows = 0): QueryResult {
  return { columns, rows, affected_rows, plan, error: null }
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

function select(statement: string): QueryResult {
  const match = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(.*)$/is.exec(statement)
  if (!match) return fail('SyntaxError', 'Se esperaba SELECT <columnas> FROM <tabla>')

  const [, selectList, tableName, rest] = match
  const table = findTable(tableName)
  if (!table) return fail('TableNotFound', `La tabla "${tableName}" no existe`)

  const names = table.columns.map((column) => column.name)

  const groupBy = /GROUP\s+BY\s+(\w+)/i.exec(rest)?.[1]
  if (groupBy) return aggregate(table, groupBy)

  const projection = selectList.trim() === '*' ? names : selectList.split(',').map((s) => s.trim())
  const missing = projection.find((name) => !names.includes(name))
  if (missing) return fail('ColumnNotFound', `La columna "${missing}" no existe en ${table.name}`)

  const pk = /WHERE\s+id\s*=\s*(\d+)/i.exec(rest)?.[1]
  const orderBy = /ORDER\s+BY\s+(\w+)(\s+DESC)?/i.exec(rest)
  const limit = Number(/LIMIT\s+(\d+)/i.exec(rest)?.[1] ?? table.row_count)

  let rows: Value[][]
  let plan: PlanNode

  if (pk !== undefined) {
    const id = Number(pk)
    rows = id >= 1 && id <= table.row_count ? [generateRow(table.name, id - 1)] : []
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
    const total = table.row_count
    const direction = desc ? -1 : 1
    rows = Array.from({ length: total }, (_, i) => generateRow(table.name, i))
      .sort((a, b) => compare(a[position], b[position]) * direction)
      .slice(0, limit)

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
    // El LIMIT puede superar row_count para probar la UI con 100 000 filas.
    rows = Array.from({ length: limit }, (_, i) => generateRow(table.name, i))
    plan = node('SeqScan', { table: table.name, organization: table.organization }, limit, pages(limit))
  }

  const positions = projection.map((name) => names.indexOf(name))
  const projected = rows.map((row) => positions.map((position) => row[position]))
  plan = node('Project', { columns: projection.join(', ') }, projected.length, 0, [plan])
  return ok(projection, projected, plan)
}

function aggregate(table: TableInfo, column: string): QueryResult {
  const position = table.columns.findIndex((candidate) => candidate.name === column)
  if (position < 0) return fail('ColumnNotFound', `La columna "${column}" no existe en ${table.name}`)

  const counts = new Map<Value, number>()
  for (let i = 0; i < table.row_count; i++) {
    const key = generateRow(table.name, i)[position]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const rows: Value[][] = [...counts].sort(([a], [b]) => compare(a, b))
  const scan = node(
    'SeqScan',
    { table: table.name, organization: table.organization },
    table.row_count,
    pages(table.row_count),
  )
  const plan = node(
    'ExternalHashAggregate',
    { group_by: column, aggregate: 'COUNT(*)', partitions: Math.ceil(pages(table.row_count) / SORT_BUFFER_PAGES) },
    rows.length,
    pages(table.row_count),
    [scan],
    pages(table.row_count),
  )
  return ok([column, 'count'], rows, plan)
}

function insert(statement: string): QueryResult {
  const match = /^INSERT\s+INTO\s+(\w+)\s+VALUES\s*\((.*)\)$/is.exec(statement)
  if (!match) return fail('SyntaxError', 'Se esperaba INSERT INTO <tabla> VALUES (...)')

  const [, tableName, valueList] = match
  const table = findTable(tableName)
  if (!table) return fail('TableNotFound', `La tabla "${tableName}" no existe`)

  const received = valueList.split(',').length
  if (received !== table.columns.length) {
    return fail(
      'ColumnCountMismatch',
      `${table.name} tiene ${table.columns.length} columnas y se recibieron ${received} valores`,
    )
  }

  const touched = 1 + table.indexes.length
  const plan = node(
    'Insert',
    { table: table.name, organization: table.organization, indexes: table.indexes.length },
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

  const affected = predicate ? 1 : table.row_count
  const scan = predicate
    ? node(
        'IndexScan',
        { index: table.indexes[0]?.kind ?? 'none', table: table.name, predicate: predicate.trim() },
        affected,
        BPLUS_HEIGHT + 1,
      )
    : node('SeqScan', { table: table.name, organization: table.organization }, affected, pages(affected))

  const plan = node(
    'Delete',
    { table: table.name, strategy: table.organization === 'sequential' ? 'lazy' : 'tombstone' },
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

export class MockClient implements SoupClient {
  readonly source = 'SoupDB · mock'
  readonly connected = true

  async listTables(): Promise<TableInfo[]> {
    await delay(LATENCY_MS / 3)
    return structuredClone(TABLES)
  }

  async execute(sql: string): Promise<QueryResult> {
    await delay(LATENCY_MS)
    const statement = sql.trim().replace(/;\s*$/, '')
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
