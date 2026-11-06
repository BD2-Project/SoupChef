import type { Value } from '../../types/contract'
import { lugar } from './lugares'

export const PAPER_COUNT = 1000
export const CHUNKS_PER_PAPER = 8
export const DOC_COUNT = 60
export const IMAGE_COUNT = 24
export const SONG_COUNT = 18

const AUTHORS = ['García', 'Chen', 'Müller', 'Silva', 'Kumar', 'Rossi', 'Tanaka', 'Okafor']
const VENUES = ['VLDB', 'SIGMOD', 'ICDE', 'NeurIPS', 'ICML', 'ACL']
const TOPICS = [
  'B+ trees',
  'extendible hashing',
  'R-tree indexing',
  'BM25 ranking',
  'HNSW graphs',
  'IVF quantization',
  'external sorting',
  'buffer management',
]

// Filas deterministas por posición: cualquier fila se genera sin materializar la tabla.
function paper(i: number): Value[] {
  const id = i + 1
  const topic = TOPICS[i % TOPICS.length]
  return [
    id,
    `On ${topic} for multimodal databases (${id})`,
    AUTHORS[(i * 7) % AUTHORS.length],
    2000 + ((i * 7) % 26),
    VENUES[(i * 5) % VENUES.length],
    `We study ${topic} and measure disk accesses over 100k records.`,
    `data/papers/${id}.pdf`,
  ]
}

function chunk(i: number): Value[] {
  const paperId = Math.floor(i / CHUNKS_PER_PAPER) + 1
  const pos = i % CHUNKS_PER_PAPER
  const topic = TOPICS[(paperId - 1) % TOPICS.length]
  return [i + 1, paperId, pos, `Chunk ${pos + 1} of paper ${paperId}: notes on ${topic}.`]
}

// --- Tablas de plugins (búsqueda full-text y vectorial) --------------------

const DOC_TOPICS = [
  'índice invertido',
  'búsqueda vectorial',
  'ranking BM25',
  'grafos HNSW',
  'cuantización IVF',
  'base de datos multimodal',
]

function doc(i: number): Value[] {
  const id = i + 1
  const topic = DOC_TOPICS[i % DOC_TOPICS.length]
  const related = DOC_TOPICS[(i * 3 + 1) % DOC_TOPICS.length]
  const ranking = i % 2 === 0 ? 'BM25' : 'TF-IDF'
  // Repetición variable: el ranking de la demo necesita documentos con scores distintos.
  const body = `${topic} y ${related}. `.repeat(1 + (i % 3))
  return [
    id,
    `Documento ${id}: ${topic}`,
    `${body}El ranking usa ${ranking} sobre los postings del índice invertido.`,
    `data/docs/${id}.txt`,
  ]
}

/** Pseudoaleatorio determinista: los mismos vectores en cada sesión. */
function pseudo(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function embedding(i: number, dimension: number, salt: number): number[] {
  return Array.from({ length: dimension }, (_, k) =>
    Number((pseudo(i * 37 + k * 11 + salt) * 2 - 1).toFixed(3)),
  )
}

function image(i: number): Value[] {
  const id = i + 1
  const name = `foto-${String(id).padStart(2, '0')}.jpg`
  return [id, `Imagen ${id}`, `data/imagenes/${name}`, embedding(i, 8, 7)]
}

function song(i: number): Value[] {
  const id = i + 1
  const name = `cancion-${String(id).padStart(2, '0')}.mp3`
  return [id, `Canción ${id}`, `data/audio/${name}`, embedding(i, 6, 13)]
}

const GENERATORS: Record<string, (i: number) => Value[]> = {
  papers: paper,
  chunks: chunk,
  lugares: lugar,
  docs: doc,
  imagenes: image,
  canciones: song,
}

export function generateRow(table: string, i: number): Value[] {
  return GENERATORS[table](i)
}
