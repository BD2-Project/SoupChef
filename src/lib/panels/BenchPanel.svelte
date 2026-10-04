<script lang="ts">
  import {
    METRICS,
    operationLabel,
    problems,
    SPATIAL_SUITE,
    suites,
    techniqueLabel,
    type MetricId,
    type Suite,
  } from '../benchmarks/data'
  import BenchChart, { type Bar } from '../components/BenchChart.svelte'
  import Panel from '../components/Panel.svelte'

  let suiteId = $state(suites[0]?.id ?? '')
  let metricId = $state<MetricId>('elapsedMs')
  let size = $state<number | null>(null)

  const suite = $derived<Suite | null>(suites.find((item) => item.id === suiteId) ?? null)
  const metric = $derived(METRICS.find((item) => item.id === metricId) ?? METRICS[0])

  // Al cambiar de suite el tamaño elegido puede no existir: se vuelve al primero.
  const sizes = $derived(suite?.datasetSizes ?? [])
  const activeSize = $derived(size !== null && sizes.includes(size) ? size : (sizes[0] ?? 0))

  const integer = new Intl.NumberFormat('es-PE')

  function barsFor(operation: string): Bar[] {
    if (!suite) return []
    return suite.techniques.map((technique) => {
      const measurement = suite.measurements.find(
        (item) => item.technique === technique && item.operation === operation && item.datasetSize === activeSize,
      )
      return {
        key: technique,
        label: techniqueLabel(technique),
        value: measurement?.[metric.id] ?? 0,
        supported: measurement?.supported ?? false,
      }
    })
  }

  const charts = $derived((suite?.operations ?? []).map((operation) => ({ operation, bars: barsFor(operation) })))

  const spatialMissing = $derived(!suites.some((item) => item.id === SPATIAL_SUITE))

  // Resumen de "cuándo conviene cada técnica": para cada operación, la mejor por la
  // métrica activa y cuánto le saca a la peor. El factor es lo que se cita en el informe.
  const summary = $derived(
    charts.map(({ operation, bars }) => {
      const usable = bars.filter((bar) => bar.supported)
      const unsupported = bars.filter((bar) => !bar.supported).map((bar) => bar.label)
      if (usable.length === 0) return { operation, best: null, value: 0, factor: null, tie: null, unsupported }

      // Que todas midan cero no es falta de dato sino el hallazgo: por ejemplo, ninguna
      // técnica escribe durante una búsqueda. Empatar en cero no tiene ganador.
      const best = usable.reduce((a, b) => (b.value < a.value ? b : a))
      const worst = usable.reduce((a, b) => (b.value > a.value ? b : a))
      if (worst.value === 0) {
        return { operation, best: null, value: 0, factor: null, tie: 'ninguna', unsupported }
      }
      return {
        operation,
        best: best.label,
        value: best.value,
        factor: usable.length > 1 && best.value > 0 ? worst.value / best.value : null,
        tie: null,
        unsupported,
      }
    }),
  )
</script>

<Panel title="Benchmarks">
  {#snippet meta()}
    {#if suite}
      {suite.date ?? 'sin fecha'} · {integer.format(activeSize)} registros
    {:else}
      sin resultados
    {/if}
  {/snippet}

  {#if suites.length === 0}
    <p class="p-4 text-micro text-subtle">
      No hay CSV en <code class="font-mono">src/lib/benchmarks/results/</code>. Corré los benchmarks del motor y después
      <code class="font-mono">scripts/sync-benchmarks.sh</code>.
    </p>
  {:else}
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        {#if suites.length > 1}
          <div class="flex items-center gap-1" role="group" aria-label="Suite de benchmarks">
            {#each suites as item (item.id)}
              <button
                type="button"
                aria-pressed={item.id === suiteId}
                onclick={() => (suiteId = item.id)}
                class="rounded px-2 py-1 text-micro transition-colors duration-150 {item.id === suiteId
                  ? 'bg-accent-soft text-accent-text'
                  : 'text-subtle hover:bg-raised hover:text-text'}"
              >
                {item.label}
              </button>
            {/each}
          </div>
        {/if}

        <div class="flex items-center gap-1" role="group" aria-label="Métrica">
          {#each METRICS as item (item.id)}
            <button
              type="button"
              aria-pressed={item.id === metricId}
              onclick={() => (metricId = item.id)}
              class="rounded px-2 py-1 text-micro transition-colors duration-150 {item.id === metricId
                ? 'bg-accent-soft text-accent-text'
                : 'text-subtle hover:bg-raised hover:text-text'}"
            >
              {item.label}
            </button>
          {/each}
        </div>

        {#if sizes.length > 1}
          <label class="flex items-center gap-1.5 text-micro text-subtle">
            Registros
            <select
              value={activeSize}
              onchange={(event) => (size = Number(event.currentTarget.value))}
              class="rounded border border-line bg-raised px-1.5 py-1 font-mono text-micro text-text"
            >
              {#each sizes as option (option)}
                <option value={option}>{integer.format(option)}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>

      {#if metricId === 'diskReads' || metricId === 'diskWrites'}
        <p class="m-0 text-micro text-subtle">
          Los accesos a disco son la métrica que no depende de la máquina: el tiempo en milisegundos sí.
        </p>
      {/if}

      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]">
        {#each charts as chart (chart.operation)}
          <BenchChart title={operationLabel(chart.operation)} bars={chart.bars} format={metric.format} />
        {/each}
      </div>

      <table class="w-full border-collapse text-micro">
        <caption class="pb-1.5 text-left text-micro text-subtle">
          Cuándo conviene cada técnica, según {metric.label.toLowerCase()}
        </caption>
        <thead>
          <tr class="border-b border-line text-left text-subtle">
            <th class="py-1 pr-3 font-medium">Operación</th>
            <th class="py-1 pr-3 font-medium">Conviene</th>
            <th class="py-1 pr-3 text-right font-medium">Valor</th>
            <th class="py-1 pr-3 text-right font-medium">vs. la peor</th>
            <th class="py-1 font-medium">No soportada por</th>
          </tr>
        </thead>
        <tbody>
          {#each summary as row (row.operation)}
            <tr class="border-b border-line/50">
              <td class="py-1 pr-3 text-muted">{operationLabel(row.operation)}</td>
              <td class="py-1 pr-3 {row.best ? 'text-accent-text' : 'text-subtle'}">
                {row.best ?? (row.tie === null ? '—' : 'todas por igual')}
              </td>
              <td class="py-1 pr-3 text-right font-mono tabular text-muted">
                {row.best ? metric.format(row.value) : row.tie === null ? '—' : metric.format(0)}
              </td>
              <td class="py-1 pr-3 text-right font-mono tabular text-muted">
                {row.factor === null ? '—' : `${row.factor.toFixed(1)}×`}
              </td>
              <td class="py-1 text-subtle">{row.unsupported.join(', ') || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if spatialMissing}
        <p class="m-0 rounded border border-line border-dashed p-3 text-micro text-subtle">
          Falta la comparación espacial de 2.2.4 (secuencial vs R-Tree vs GiST): el motor todavía no genera
          <code class="font-mono">spatial_indexes_*.csv</code>. Las gráficas se arman solas en cuanto el archivo exista.
        </p>
      {/if}

      {#each problems as problem (problem.file)}
        <!-- No es un error: un CSV con otro formato mide otra cosa y no entra en esta comparación. -->
        <p class="m-0 text-micro text-subtle">
          <code class="font-mono">{problem.file}</code> queda fuera de la comparación: {problem.reason}.
        </p>
      {/each}
    </div>
  {/if}
</Panel>
