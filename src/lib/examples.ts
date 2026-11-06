export interface SqlExample {
  label: string
  sql: string
}

/**
 * Consultas listas para la demo del SQL nuevo de plugins.
 *
 * `SEARCH ... USING ... WITH (...)` + `SCORE()` es el contrato de la Fase 4 del
 * plan del gestor; el mock del navegador ya lo interpreta y contra el motor real
 * funciona cuando esa fase esté activa.
 */
export const EXAMPLES: SqlExample[] = [
  {
    label: 'Texto · BM25',
    sql: "SELECT *, SCORE() FROM docs WHERE SEARCH(contenido, 'índice invertido') USING INVERTED WITH (method = 'bm25', k = 10);",
  },
  {
    label: 'Texto · TF-IDF',
    sql: "SELECT id, titulo, SCORE() FROM docs WHERE SEARCH(contenido, 'búsqueda vectorial') USING INVERTED WITH (method = 'tf_idf', k = 5) ORDER BY SCORE() DESC;",
  },
  {
    label: 'Vectorial · HNSW cosine',
    sql: "SELECT id, nombre, SCORE() FROM imagenes WHERE SEARCH(archivo, 'foto-03.jpg') USING HNSW WITH (metric = 'cosine', k = 5);",
  },
  {
    label: 'Vectorial · IVF euclidiana',
    sql: "SELECT id, titulo, SCORE() FROM canciones WHERE SEARCH(audio, 'cancion-02.mp3') USING IVF WITH (metric = 'euclidean', k = 5);",
  },
  {
    label: 'Plan · nodo de plugin',
    sql: "EXPLAIN ANALYZE SELECT id, nombre, SCORE() FROM imagenes WHERE SEARCH(archivo, 'foto-03.jpg') USING HNSW WITH (metric = 'cosine', k = 5);",
  },
  {
    label: 'DDL · crear índice de plugin',
    sql: "CREATE INDEX idx_docs ON docs (contenido) USING INVERTED WITH (method = 'bm25');",
  },
  {
    label: 'Catálogo · plugins',
    sql: 'SELECT plugin_name, version, enabled FROM SysPlugins;',
  },
  {
    label: 'Catálogo · índices de plugin',
    sql: 'SELECT index_name, plugin_name, item_count, options_json FROM SysIndexes;',
  },
  {
    label: 'DML · insertar documento',
    sql: "INSERT INTO docs (id, titulo, contenido, path_pdf) VALUES (61, 'Documento nuevo', 'índice invertido incremental', 'data/docs/61.txt');",
  },
  {
    label: 'DML · buscar solo el nuevo',
    sql: "SELECT id, titulo, SCORE() FROM docs WHERE SEARCH(contenido, 'incremental') USING INVERTED WITH (k = 5);",
  },
  {
    label: 'DML · borrar el insertado',
    sql: 'DELETE FROM docs WHERE id = 61;',
  },
]
