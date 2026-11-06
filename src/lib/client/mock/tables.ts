import type { PluginInfo, TableInfo, TypeInfo } from '../../types/contract'
import { LUGAR_COUNT } from './lugares'
import { CHUNKS_PER_PAPER, DOC_COUNT, IMAGE_COUNT, PAPER_COUNT, SONG_COUNT } from './rows'

/** Tipos del wire v1.1 que el mock da por registrados (SysTypes). */
export const TYPES: TypeInfo[] = [
  { name: 'INT', encoding: 0, size: 4 },
  { name: 'FLOAT', encoding: 0, size: 8 },
  { name: 'VARCHAR', encoding: 2, size: 0 },
  { name: 'TEXT', encoding: 2, size: 0 },
  { name: 'BOOL', encoding: 0, size: 1 },
  { name: 'POINT', encoding: 0, size: 16 },
  { name: 'VECTOR', encoding: 1, size: 0 },
]

/** Plugins del gestor que el mock da por cargados (SysPlugins). */
export const PLUGINS: PluginInfo[] = [
  { name: 'INVERTED', version: '0.2.0', api_version: 1, enabled: true, options: ['method', 'k'] },
  { name: 'IVF', version: '0.2.0', api_version: 1, enabled: true, options: ['metric', 'dimension', 'profile', 'k'] },
  { name: 'HNSW', version: '0.2.0', api_version: 1, enabled: true, options: ['metric', 'dimension', 'profile', 'k'] },
]

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
  {
    name: 'lugares',
    organization: 'heap',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'nombre', type: 'VARCHAR', length: 80, primary_key: false },
      { name: 'categoria', type: 'VARCHAR', length: 24, primary_key: false },
      { name: 'ubicacion', type: 'POINT', primary_key: false },
    ],
    indexes: [
      { name: 'lugares_pk', kind: 'bplus_clustered', column: 'id' },
      { name: 'lugares_geo', kind: 'rtree', column: 'ubicacion' },
    ],
    row_count: LUGAR_COUNT,
  },
  {
    name: 'docs',
    organization: 'heap',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'titulo', type: 'VARCHAR', length: 120, primary_key: false },
      { name: 'contenido', type: 'TEXT', primary_key: false },
      { name: 'path_pdf', type: 'VARCHAR', length: 256, primary_key: false },
    ],
    indexes: [
      { name: 'docs_pk', kind: 'bplus_clustered', column: 'id' },
      {
        name: 'docs_contenido',
        kind: 'inverted',
        column: 'contenido',
        plugin: 'INVERTED',
        options: { method: 'bm25' },
        item_count: DOC_COUNT,
      },
    ],
    row_count: DOC_COUNT,
  },
  {
    name: 'imagenes',
    organization: 'heap',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'nombre', type: 'VARCHAR', length: 80, primary_key: false },
      { name: 'archivo', type: 'VARCHAR', length: 256, primary_key: false },
      { name: 'embedding', type: 'VECTOR', length: 8, primary_key: false },
    ],
    indexes: [
      { name: 'imagenes_pk', kind: 'bplus_clustered', column: 'id' },
      {
        name: 'imagenes_vec',
        kind: 'hnsw',
        column: 'embedding',
        plugin: 'HNSW',
        options: { metric: 'cosine', dimension: 8 },
        item_count: IMAGE_COUNT,
      },
    ],
    row_count: IMAGE_COUNT,
  },
  {
    name: 'canciones',
    organization: 'heap',
    columns: [
      { name: 'id', type: 'INT', primary_key: true },
      { name: 'titulo', type: 'VARCHAR', length: 120, primary_key: false },
      { name: 'audio', type: 'VARCHAR', length: 256, primary_key: false },
      { name: 'perfil', type: 'VECTOR', length: 6, primary_key: false },
    ],
    indexes: [
      { name: 'canciones_pk', kind: 'bplus_clustered', column: 'id' },
      {
        name: 'canciones_vec',
        kind: 'ivf',
        column: 'perfil',
        plugin: 'IVF',
        options: { metric: 'euclidean', dimension: 6 },
        item_count: SONG_COUNT,
      },
    ],
    row_count: SONG_COUNT,
  },
]
