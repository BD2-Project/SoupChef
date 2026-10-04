<script module lang="ts">
  export interface Bar {
    key: string
    label: string
    value: number
    /** `false` dibuja la barra como no aplicable en vez de como un cero real. */
    supported: boolean
  }
</script>

<script lang="ts">
  interface Props {
    title: string
    bars: Bar[]
    format: (value: number) => string
    /** `true` cuando la métrica es mejor mientras más baja: tiempo, accesos, espacio. */
    lowerIsBetter?: boolean
  }

  let { title, bars, format, lowerIsBetter = true }: Props = $props()

  // Barras horizontales: los nombres de las técnicas no entran bajo una columna.
  const COLORS = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)']

  const usable = $derived(bars.filter((bar) => bar.supported))
  // La escala es por gráfico: construir y buscar difieren en órdenes de magnitud y
  // una escala común aplastaría las operaciones baratas hasta volverlas invisibles.
  const max = $derived(Math.max(...usable.map((bar) => bar.value), 0))
  const best = $derived(
    usable.length < 2
      ? null
      : usable.reduce((a, b) => ((lowerIsBetter ? b.value < a.value : b.value > a.value) ? b : a)).key,
  )
</script>

<figure class="m-0 flex flex-col gap-2 rounded border border-line bg-sunken p-3">
  <figcaption class="text-micro font-medium text-muted">{title}</figcaption>

  <div class="flex flex-col gap-1.5">
    {#each bars as bar, index (bar.key)}
      <div class="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2">
        <span class="truncate text-micro {bar.key === best ? 'text-text font-medium' : 'text-subtle'}" title={bar.label}>
          {bar.label}
        </span>

        {#if bar.supported}
          <div class="flex items-center gap-2">
            <div class="h-3.5 min-w-0 flex-1 rounded-sm bg-raised">
              <div
                class="h-full rounded-sm transition-[width] duration-500 ease-out-quart"
                style:width="{max > 0 ? Math.max((bar.value / max) * 100, bar.value > 0 ? 1.5 : 0) : 0}%"
                style:background-color={COLORS[index % COLORS.length]}
              ></div>
            </div>
            <span class="shrink-0 text-right font-mono text-micro tabular text-muted" style:min-width="5.5rem">
              {format(bar.value)}
            </span>
          </div>
        {:else}
          <span class="text-micro text-subtle italic">no soportada</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if best !== null}
    <p class="m-0 text-micro text-subtle">
      Mejor: <span class="text-accent-text">{bars.find((bar) => bar.key === best)?.label}</span>
    </p>
  {/if}
</figure>
