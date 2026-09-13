import type { Value } from '../../types/contract'

export const PAPER_COUNT = 1000
export const CHUNKS_PER_PAPER = 8

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
    2000 + ((i * 13) % 26),
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

const GENERATORS: Record<string, (i: number) => Value[]> = { papers: paper, chunks: chunk }

export function generateRow(table: string, i: number): Value[] {
  return GENERATORS[table](i)
}
