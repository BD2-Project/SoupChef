import type { TableInfo } from '../../types/contract'
import { CHUNKS_PER_PAPER, PAPER_COUNT } from './rows'

export const TABLES: TableInfo[] = [
  {
    name: 'papers',
    organization: 'sequential',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'titulo', type: 'VARCHAR', length: 256, primary_key: false },
      { name: 'autor', type: 'VARCHAR', length: 128, primary_key: false },
      { name: 'anio', type: 'INT', primary_key: false },
      { name: 'venue', type: 'VARCHAR', length: 64, primary_key: false },
      { name: 'abstract', type: 'TEXT', primary_key: false },
      { name: 'path_pdf', type: 'VARCHAR', length: 256, primary_key: false },
    ],
    indexes: [
      { name: 'papers_pk', kind: 'bplus_clustered', column: 'id' },
      { name: 'papers_anio', kind: 'bplus_unclustered', column: 'anio' },
      { name: 'papers_autor', kind: 'extendible_hash', column: 'autor' },
    ],
    row_count: PAPER_COUNT,
  },
  {
    name: 'chunks',
    organization: 'heap',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'paper_id', type: 'INT', primary_key: false },
      { name: 'pos', type: 'INT', primary_key: false },
      { name: 'texto', type: 'TEXT', primary_key: false },
    ],
    indexes: [
      { name: 'chunks_pk', kind: 'extendible_hash', column: 'id' },
      { name: 'chunks_paper', kind: 'bplus_unclustered', column: 'paper_id' },
    ],
    row_count: PAPER_COUNT * CHUNKS_PER_PAPER,
  },
]
