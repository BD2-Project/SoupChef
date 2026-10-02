import type { GeoPoint, QueryResult, Value } from './types/contract'

const EARTH_RADIUS_M = 6_371_000

export function isGeoPoint(value: Value): value is GeoPoint {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value
}

/** Índice de la primera columna espacial del resultado, o -1 si no hay ninguna. */
export function pointColumnIndex(result: QueryResult): number {
  const firstRow = result.rows[0]
  if (!firstRow) return -1
  return firstRow.findIndex(isGeoPoint)
}

/**
 * Distancia en metros sobre la superficie terrestre.
 *
 * Haversine y no euclidiana: a la latitud de Lima un grado de longitud mide
 * unos 109 km y uno de latitud 111 km, así que tratar los grados como un plano
 * deformaría los radios. El enunciado (2.2.1) pide ambas métricas.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.y - a.y)
  const dLon = toRad(b.x - a.x)
  const lat1 = toRad(a.y)
  const lat2 = toRad(b.y)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distancia euclidiana en grados: la métrica plana que también pide el enunciado. */
export function euclideanDegrees(a: GeoPoint, b: GeoPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function formatPoint(point: GeoPoint): string {
  return `${point.y.toFixed(5)}, ${point.x.toFixed(5)}`
}

export function formatMeters(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} km`
    : `${Math.round(meters)} m`
}

export interface SpatialQuery {
  center: GeoPoint
  radius?: number
  k?: number
  metric: 'haversine' | 'euclidiana'
}

const DISTANCE_CALL = /distancia\s*\(\s*\w+\s*,\s*POINT\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*\)/i

/**
 * Lee el centro y el radio (o el k) del SQL ejecutado.
 *
 * Se parsea en el cliente a propósito: el resultado solo trae filas, así que el
 * mapa necesita el texto de la consulta para dibujar el círculo o numerar los
 * vecinos. Funciona igual con el mock y con el motor real.
 */
export function parseSpatialQuery(sql: string): SpatialQuery | null {
  const match = DISTANCE_CALL.exec(sql)
  if (!match) return null

  const [, latitude, longitude] = match
  const radius = /distancia\s*\([^)]*\)\s*\)?\s*<\s*(-?[\d.]+)/i.exec(sql)?.[1]
  const limit = /LIMIT\s+(\d+)/i.exec(sql)?.[1]

  return {
    center: { x: Number(longitude), y: Number(latitude) },
    radius: radius === undefined ? undefined : Number(radius),
    k: radius === undefined && limit !== undefined ? Number(limit) : undefined,
    metric: /USING\s+EUCLIDIANA/i.test(sql) ? 'euclidiana' : 'haversine',
  }
}
