import type { ColumnType, IndexInfo, PluginInfo, TableInfo, TypeInfo, Value } from './types/contract'

export const ORGANIZATIONS: Record<string, string> = {
  HEAP: 'heap',
  SEQUENTIAL: 'sequential',
}

export const INDEX_KINDS: Record<string, string> = {
  HASH: 'extendible_hash',
  BTREE: 'bplus_unclustered',
  INVERTED: 'inverted',
  IVF: 'ivf',
  HNSW: 'hnsw',
}

/** Opciones que el frontend conoce aunque el catálogo aún no declare capabilities. */
export const PLUGIN_OPTIONS: Record<string, string[]> = {
  INVERTED: ['method', 'k'],
  IVF: ['metric', 'dimension', 'profile', 'k'],
  HNSW: ['metric', 'dimension', 'profile', 'k'],
}

const NATIVE_TYPES: ColumnType[] = ['INT', 'FLOAT', 'VARCHAR', 'TEXT', 'BOOL', 'POINT']

/** `type_name` del protocolo v1.1; lo desconocido se marca como OPAQUE. */
export function columnType(name: string): ColumnType {
  const upper = name.toUpperCase() as ColumnType
  if (upper === 'VECTOR') return 'VECTOR'
  return NATIVE_TYPES.includes(upper) ? upper : 'OPAQUE'
}

export function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export function capabilityOptions(capabilities: Record<string, unknown> | undefined): string[] {
  const raw = capabilities?.index_options
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string')
  if (raw && typeof raw === 'object') return Object.keys(raw)
  return []
}

/** Construye `TableInfo[]` desde las filas de SysTables/SysColumns/SysIndexes. */
export function buildTables(
  tablesRows: Value[][],
  columnsRows: Value[][],
  indexRows: Value[][],
  counts: Record<string, number>,
): TableInfo[] {
  return tablesRows.map(([name, strategy]) => {
    const tableName = String(name)
    return {
      name: tableName,
      organization: ORGANIZATIONS[String(strategy)] ?? String(strategy).toLowerCase(),
      columns: columnsRows
        .filter((row) => row[0] === tableName)
        .map((row) => {
          const typeName = String(row[2] ?? 'TEXT')
          return {
            name: String(row[1]),
            type: columnType(typeName),
            typeName,
            length: Number(row[3]) || undefined,
            primary_key: false,
          }
        }),
      indexes: indexRows
        .filter((row) => row[1] === tableName)
        .map((row): IndexInfo => {
          const plugin = row[4] === null || row[4] === undefined ? undefined : String(row[4])
          return {
            name: String(row[0]),
            kind: plugin ? plugin.toLowerCase() : (INDEX_KINDS[String(row[3])] ?? String(row[3]).toLowerCase()),
            column: String(row[2]),
            plugin,
            options: parseJsonObject(row[5]),
            capabilities: parseJsonObject(row[6]),
            item_count: row[7] === null || row[7] === undefined ? undefined : Number(row[7]),
          }
        }),
      row_count: counts[tableName] ?? 0,
    }
  })
}

/** Plugins de SysPlugins + opciones declaradas por sus índices. */
export function buildPlugins(pluginRows: Value[][], capabilityRows: Value[][]): PluginInfo[] {
  const options = new Map<string, Set<string>>()
  for (const [name, capabilitiesJson] of capabilityRows) {
    const plugin = String(name)
    const set = options.get(plugin) ?? new Set<string>()
    for (const option of capabilityOptions(parseJsonObject(capabilitiesJson))) set.add(option)
    options.set(plugin, set)
  }

  return pluginRows.map((row) => {
    const name = String(row[0])
    const merged = new Set([...(PLUGIN_OPTIONS[name] ?? []), ...(options.get(name) ?? [])])
    return {
      name,
      version: String(row[1] ?? ''),
      api_version: Number(row[2] ?? 0),
      enabled: Boolean(row[3]),
      options: [...merged],
    }
  })
}

export function buildTypes(typeRows: Value[][]): TypeInfo[] {
  return typeRows.map((row) => ({
    name: String(row[0]),
    plugin: row[1] === null || row[1] === undefined ? undefined : String(row[1]),
    encoding: Number(row[2] ?? 0),
    size: Number(row[3] ?? 0),
  }))
}
