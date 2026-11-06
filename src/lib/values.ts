import { formatPoint, isGeoPoint } from './spatial'
import type { UnknownValue, Value } from './types/contract'

/** Un `VECTOR(n)` llega como array plano de números (protocolo v1.1). */
export function isVector(value: Value): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

/** Valor opaco de un tipo extensible: `{ $opaque, type_name, bytes }`. */
export function isUnknown(value: Value): value is UnknownValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$opaque' in value
}

/** Muestra las primeras dimensiones: un VECTOR(768) no cabe en una celda. */
export function formatVector(values: number[], limit = 4): string {
  const head = values.slice(0, limit).map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(3)))
  const tail = values.length > limit ? ', …' : ''
  return `[${head.join(', ')}${tail}]`
}

export function formatUnknown(value: UnknownValue): string {
  return `‹${value.type_name}› ${value.bytes.length} B`
}

export function displayValue(value: Value): string {
  if (value === null) return 'NULL'
  if (isGeoPoint(value)) return formatPoint(value)
  if (isVector(value)) return formatVector(value)
  if (isUnknown(value)) return formatUnknown(value)
  return String(value)
}
