/**
 * Fila resaltada en común entre la tabla de resultados y el mapa.
 *
 * Vive fuera de los componentes porque los dos paneles son hermanos: pasarlo por
 * props obligaría a `App` a conocer un detalle que solo le importa a la vista
 * espacial. El índice es el de `result.rows`, no el del marcador, porque hay filas
 * sin coordenadas que el mapa no dibuja.
 */
class Highlight {
  row = $state<number | null>(null)
  /** Quién inició el resalte: solo el mapa justifica desplazar la tabla. */
  source = $state<'table' | 'map' | null>(null)

  set(row: number, source: 'table' | 'map'): void {
    this.row = row
    this.source = source
  }

  clear(): void {
    this.row = null
    this.source = null
  }
}

export const highlight = new Highlight()
