import type { GeoPoint, Value } from '../../types/contract'

export const LUGAR_COUNT = 400

/** Plaza de Armas: el centro que usa el enunciado en sus consultas de ejemplo. */
export const LIMA_CENTER: GeoPoint = { x: -77.0428, y: -12.0464 }

const DISTRITOS: { nombre: string; punto: GeoPoint }[] = [
  { nombre: 'Miraflores', punto: { x: -77.0282, y: -12.1211 } },
  { nombre: 'Barranco', punto: { x: -77.0206, y: -12.1465 } },
  { nombre: 'San Isidro', punto: { x: -77.0365, y: -12.0972 } },
  { nombre: 'Cercado', punto: { x: -77.0428, y: -12.0464 } },
  { nombre: 'Surco', punto: { x: -76.9936, y: -12.1353 } },
  { nombre: 'San Borja', punto: { x: -77.0003, y: -12.1083 } },
  { nombre: 'Pueblo Libre', punto: { x: -77.0631, y: -12.0742 } },
  { nombre: 'La Molina', punto: { x: -76.9447, y: -12.0789 } },
  { nombre: 'Jesús María', punto: { x: -77.0497, y: -12.0781 } },
  { nombre: 'Callao', punto: { x: -77.1181, y: -12.0566 } },
]

const CATEGORIAS = ['cafetería', 'librería', 'parque', 'universidad', 'museo', 'restaurante']

/** Generador congruencial: los mismos lugares en cada sesión, sin guardar la tabla. */
function pseudo(index: number, salt: number): number {
  const seed = (index * 1103515245 + salt * 12345 + 1013904223) >>> 0
  return ((seed >>> 8) % 100000) / 100000
}

export function lugarPoint(i: number): GeoPoint {
  const { punto } = DISTRITOS[i % DISTRITOS.length]
  // ±0.018° ≈ 2 km alrededor del centro del distrito.
  return {
    x: punto.x + (pseudo(i, 1) - 0.5) * 0.036,
    y: punto.y + (pseudo(i, 2) - 0.5) * 0.036,
  }
}

export function lugar(i: number): Value[] {
  const distrito = DISTRITOS[i % DISTRITOS.length]
  const categoria = CATEGORIAS[Math.floor(pseudo(i, 3) * CATEGORIAS.length) % CATEGORIAS.length]
  const nombre = `${categoria[0].toUpperCase()}${categoria.slice(1)} ${distrito.nombre} ${i + 1}`
  return [i + 1, nombre, categoria, lugarPoint(i)]
}
