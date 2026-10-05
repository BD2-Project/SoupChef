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

/** Un radio euclidiano se expresa en grados: llamarlo metros sería falso. */
export function formatDegrees(degrees: number): string {
  return `${degrees.toLocaleString('es-PE', { maximumFractionDigits: 4 })}°`
}

export function formatMeters(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} km`
    : `${Math.round(meters)} m`
}

/** Un polígono de la consulta, ya en coordenadas internas. */
export type Polygon = GeoPoint[]

export interface SpatialQuery {
  /** Vértices de `intersects(col, POLYGON(...))`, si la consulta lo usa. */
  polygon?: Polygon
  center: GeoPoint
  /** En las unidades de `unit`: metros con haversine, grados con euclidiana. */
  radius?: number
  k?: number
  metric: 'haversine' | 'euclidiana'
  unit: 'm' | 'deg'
}

/**
 * Grados a metros, para dibujar un radio euclidiano sobre el mapa.
 *
 * Es una aproximación: un grado de longitud se acorta con la latitud, así que el
 * conjunto que cumple el predicado euclidiano es en rigor una elipse. Sirve para
 * situar el círculo, no para medir.
 */
export const METERS_PER_DEGREE = 111_320

/**
 * `distancia(col, POINT(lat, lon))`, o `distance(...)`, con la métrica opcional
 * como tercer argumento. Es la forma que fija el enunciado (2.2.3) y la que
 * acepta el motor.
 */
const DISTANCE_CALL =
  /dist(?:ance|ancia)\s*\(\s*\w+\s*,\s*POINT\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*(?:,\s*'(\w+)'\s*)?\)/i

/** Radio del predicado: `... ) < 5` o `< 5.0`, con el operador `<` o `<=`. */
const RADIUS_PREDICATE = /dist(?:ance|ancia)\s*\([^;]*?\)\s*<=?\s*(-?[\d.]+)/i

const LIMIT_CLAUSE = /LIMIT\s+(\d+)/i

/** Abre la lista de vértices: `intersects(columna, POLYGON(` */
const INTERSECTS_CALL = /intersects\s*\(\s*\w+\s*,\s*POLYGON\s*\(/i
const VERTEX = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g

/**
 * Contenido de un paréntesis que se abre en `start`, contando anidamiento.
 *
 * Un regex no sirve acá: la lista de vértices contiene paréntesis, y cualquier
 * patrón que busque el cierre termina parando en el del último vértice y
 * perdiéndolo. El polígono se dibujaba con un lado de menos.
 */
function balanced(sql: string, start: number): string | null {
  let depth = 0
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') {
      depth--
      if (depth === 0) return sql.slice(start + 1, i)
    }
  }
  return null
}

/**
 * Lee los vértices del polígono del SQL ejecutado.
 *
 * El literal lleva la latitud primero, igual que `POINT`, así que el vértice se
 * invierte al pasarlo a GeoPoint.
 */
export function parsePolygon(sql: string): Polygon | null {
  const call = INTERSECTS_CALL.exec(sql)
  if (!call) return null

  const lista = balanced(sql, call.index + call[0].length - 1)
  if (lista === null) return null

  const vertices: Polygon = []
  for (const match of lista.matchAll(VERTEX)) {
    vertices.push({ x: Number(match[2]), y: Number(match[1]) })
  }
  // Un polígono necesita al menos tres vértices para encerrar un área.
  return vertices.length >= 3 ? vertices : null
}

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

  // El literal va en el orden del enunciado: latitud primero.
  const [, latitude, longitude, metricName] = match
  // Sin tercer argumento el motor usa la euclidiana: el radio queda en grados.
  const metric = metricName?.toLowerCase() === 'haversine' ? 'haversine' : 'euclidiana'
  const radius = RADIUS_PREDICATE.exec(sql)?.[1]
  const limit = LIMIT_CLAUSE.exec(sql)?.[1]

  return {
    center: { x: Number(longitude), y: Number(latitude) },
    // Haversine llega en metros; la euclidiana, en grados de coordenada.
    radius: radius === undefined ? undefined : Number(radius),
    k: radius === undefined && limit !== undefined ? Number(limit) : undefined,
    metric,
    unit: metric === 'haversine' ? 'm' : 'deg',
  }
}
