import { buildPlugins, buildTables, buildTypes } from '../../catalog'
import type { PluginInfo, TableInfo, TypeInfo, Value } from '../../types/contract'

import type { SoupConnection } from './connection'

export interface CatalogPayload {
  tables: TableInfo[]
  plugins: PluginInfo[]
  types: TypeInfo[]
}

/** Ejecuta una consulta de catálogo y degrada a `null` si el gestor no la soporta. */
async function catalogRows(connection: SoupConnection, sql: string): Promise<Value[][] | null> {
  try {
    const outcome = await connection.query(sql)
    return outcome.type === 'result' ? (outcome.result.rows as Value[][]) : []
  } catch {
    return null
  }
}

/**
 * Catálogo consultable del gestor (SysTables/SysColumns/SysIndexes/SysPlugins/
 * SysTypes). Las columnas nuevas de plugins se leen con fallback a la forma
 * clásica para no romper con un gestor a medio actualizar.
 */
export async function loadCatalog(connection: SoupConnection): Promise<CatalogPayload> {
  const tables = (await catalogRows(connection, 'SELECT table_name, strategy FROM SysTables')) ?? []
  const columns =
    (await catalogRows(
      connection,
      'SELECT table_name, column_name, type_name, length FROM SysColumns ORDER BY position',
    )) ?? []

  const richIndexes = await catalogRows(
    connection,
    'SELECT index_name, table_name, column_name, index_type, plugin_name, options_json, capabilities_json, item_count FROM SysIndexes',
  )
  const indexes =
    richIndexes ??
    (await catalogRows(connection, 'SELECT index_name, table_name, column_name, index_type FROM SysIndexes')) ??
    []

  const plugins =
    (await catalogRows(connection, 'SELECT plugin_name, version, api_version, enabled FROM SysPlugins')) ?? []
  const capabilities =
    (await catalogRows(
      connection,
      'SELECT plugin_name, capabilities_json FROM SysIndexes WHERE plugin_name IS NOT NULL',
    )) ?? []
  const types =
    (await catalogRows(connection, 'SELECT type_name, plugin_name, encoding, size FROM SysTypes')) ?? []

  const counts: Record<string, number> = {}
  await Promise.all(
    tables.map(async ([name]) => {
      const tableName = String(name)
      const result = await catalogRows(connection, `SELECT COUNT(*) FROM ${tableName}`)
      counts[tableName] = Number(result?.[0]?.[0] ?? 0)
    }),
  )

  return {
    tables: buildTables(tables, columns, indexes, counts),
    plugins: buildPlugins(plugins, capabilities),
    types: buildTypes(types),
  }
}
