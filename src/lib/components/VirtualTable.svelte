<script lang="ts">
  import { formatPoint, isGeoPoint } from '../spatial'
  import type { Value } from '../types/contract'

  interface Props {
    columns: string[]
    rows: Value[][]
    /** Índice de la fila a resaltar, para sincronizar con el mapa. */
    highlighted?: number | null
    onhover?: (row: number | null) => void
    /** Desplaza hasta la fila resaltada: solo cuando el resalte vino de afuera. */
    follow?: boolean
  }

  let { columns, rows, highlighted = null, onhover, follow = false }: Props = $props()

  const ROW_HEIGHT = 28
  const OVERSCAN = 8
  const SAMPLE_ROWS = 200
  const MIN_CH = 6
  const MAX_CH = 48

  let scrollTop = $state(0)
  let viewportHeight = $state(0)

  function display(value: Value): string {
    if (value === null) return 'NULL'
    // Una columna POINT es un objeto: se muestra como "latitud, longitud".
    if (isGeoPoint(value)) return formatPoint(value)
    return String(value)
  }

  // El ancho se estima con una muestra: medir 100 000 filas bloquearía la interfaz.
  const widths = $derived(
    columns.map((name, column) => {
      let longest = name.length
      for (let row = 0; row < Math.min(rows.length, SAMPLE_ROWS); row++) {
        longest = Math.max(longest, display(rows[row][column]).length)
      }
      return Math.min(MAX_CH, Math.max(MIN_CH, longest))
    }),
  )

  // El padding de la celda (px-2) se suma aparte: en ch no alcanza a cubrirlo.
  const track = (chars: number) => `calc(${chars + 1}ch + 1rem)`
  const gutter = $derived(String(rows.length).length)
  const template = $derived([track(gutter), ...widths.map(track)].join(' '))

  // Solo se dibujan las filas visibles; la cabecera fija ocupa una fila del scroll.
  const start = $derived(Math.max(0, Math.floor((scrollTop - ROW_HEIGHT) / ROW_HEIGHT) - OVERSCAN))
  const end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN))
  const visible = $derived(rows.slice(start, end))

  let viewport: HTMLDivElement | undefined = $state()

  // Un solo listener en el contenedor: colgar uno por fila convertiría cada `role="row"`
  // en un elemento interactivo que además tendría que ser enfocable.
  function trackHover(event: MouseEvent | FocusEvent): void {
    if (!onhover) return
    const row = (event.target as Element | null)?.closest('[role="row"]')
    const index = row?.getAttribute('aria-rowindex')
    // La cabecera es la fila 1 y no corresponde a ningún dato.
    if (index) onhover(Number(index) - 2)
  }

  $effect(() => {
    if (!follow || highlighted === null || !viewport) return
    // +1 por la cabecera fija, que ocupa una fila del scroll.
    const top = (highlighted + 1) * ROW_HEIGHT
    if (top < scrollTop || top + ROW_HEIGHT > scrollTop + viewportHeight) {
      viewport.scrollTo({ top: top - viewportHeight / 2, behavior: 'smooth' })
    }
  })
</script>

<div
  role="table"
  aria-rowcount={rows.length + 1}
  aria-colcount={columns.length + 1}
  class="h-full overflow-auto"
  bind:this={viewport}
  bind:clientHeight={viewportHeight}
  onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
  onmouseleave={() => onhover?.(null)}
  onmouseover={trackHover}
  onfocusin={trackHover}
>
  <div class="w-max min-w-full font-mono text-micro">
    <div
      role="row"
      aria-rowindex={1}
      class="sticky top-0 z-10 grid border-b border-line bg-sunken"
      style:grid-template-columns={template}
      style:height="{ROW_HEIGHT}px"
    >
      <span role="columnheader" aria-label="Número de fila" class="px-2"></span>
      {#each columns as column}
        <span role="columnheader" class="truncate px-2 font-sans leading-7 font-medium text-muted">{column}</span>
      {/each}
    </div>

    <div class="relative" style:height="{rows.length * ROW_HEIGHT}px">
      <div class="absolute inset-x-0 top-0" style:transform="translateY({start * ROW_HEIGHT}px)">
        {#each visible as row, offset}
          <div
            role="row"
            aria-rowindex={start + offset + 2}
            class="grid border-b border-line/50 transition-colors duration-100 hover:bg-raised {start + offset ===
            highlighted
              ? 'bg-accent-soft'
              : ''}"
            style:grid-template-columns={template}
            style:height="{ROW_HEIGHT}px"
          >
            <span role="cell" class="px-2 text-right leading-7 text-subtle tabular">{start + offset + 1}</span>
            {#each row as value, column}
              {@const text = display(value)}
              <span
                role="cell"
                title={text.length > widths[column] ? text : undefined}
                class="truncate px-2 leading-7 {typeof value === 'number' || isGeoPoint(value) ? 'text-right tabular' : ''} {value === null
                  ? 'text-subtle italic'
                  : 'text-text'}"
              >
                {text}
              </span>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
