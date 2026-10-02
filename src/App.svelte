<script lang="ts">
  import { client } from './lib/client'
  import StatusBar from './lib/components/StatusBar.svelte'
  import ThemeToggle from './lib/components/ThemeToggle.svelte'
  import BenchPanel from './lib/panels/BenchPanel.svelte'
  import FilesPanel from './lib/panels/FilesPanel.svelte'
  import MapPanel from './lib/panels/MapPanel.svelte'
  import PlanPanel from './lib/panels/PlanPanel.svelte'
  import QueryPanel from './lib/panels/QueryPanel.svelte'
  import ResultsPanel from './lib/panels/ResultsPanel.svelte'
  import { query } from './lib/query.svelte'
  import { pointColumnIndex } from './lib/spatial'

  query.loadTables()

  // El plan solo llega con EXPLAIN ANALYZE; el mapa, solo si el resultado trae coordenadas.
  // Sin ninguno de los dos, consulta y resultados ocupan todo el ancho.
  const result = $derived(query.result)
  const plan = $derived(result?.plan ?? null)
  const spatial = $derived(result !== null && !result.error && pointColumnIndex(result) >= 0)
  const aside = $derived(plan !== null || spatial)

  // Los benchmarks son una vista aparte: comparan técnicas, no responden consultas.
  let view = $state<'consulta' | 'benchmarks'>('consulta')
  const VIEWS = [
    { id: 'consulta', label: 'Consulta' },
    { id: 'benchmarks', label: 'Benchmarks' },
  ] as const
</script>

<div class="flex h-full flex-col">
  <header
    class="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-sunken px-3 transition-colors duration-200"
  >
    <span class="text-ui font-semibold tracking-tight">Soup<span class="text-accent-text">Chef</span></span>
    <span class="h-4 w-px bg-line" aria-hidden="true"></span>
    <span class="text-micro text-subtle">cliente de SoupDB</span>

    <nav class="ml-4 flex items-center gap-1" aria-label="Vista">
      {#each VIEWS as item (item.id)}
        <button
          type="button"
          aria-current={view === item.id ? 'page' : undefined}
          onclick={() => (view = item.id)}
          class="rounded px-2 py-1 text-micro transition-colors duration-150 {view === item.id
            ? 'bg-accent-soft text-accent-text'
            : 'text-subtle hover:bg-raised hover:text-text'}"
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="ml-auto">
      <ThemeToggle />
    </div>
  </header>

  {#if view === 'benchmarks'}
    <main class="grid min-h-0 flex-1 animate-rise"><BenchPanel /></main>
  {:else}
    <!-- gap-px sobre bg-line dibuja divisores de 1px entre paneles, como en un IDE -->
    <main
      class="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-px bg-line {aside
        ? 'grid-cols-[15rem_minmax(0,1fr)_28rem]'
        : 'grid-cols-[15rem_minmax(0,1fr)]'}"
    >
      <div class="col-start-1 row-span-2 row-start-1 grid min-h-0 animate-rise"><FilesPanel /></div>
      <div class="col-start-2 row-start-1 grid min-h-0 animate-rise [animation-delay:60ms]"><QueryPanel /></div>
      <div class="col-start-2 row-start-2 grid min-h-0 animate-rise [animation-delay:120ms]"><ResultsPanel /></div>
      {#if aside}
        <!-- Mapa y plan comparten la columna derecha; si están los dos, se reparten. -->
        <div
          class="col-start-3 row-span-2 row-start-1 grid min-h-0 gap-px bg-line animate-rise [animation-duration:280ms]"
        >
          {#if spatial && result}
            <MapPanel {result} />
          {/if}
          {#if plan}
            <PlanPanel {plan} />
          {/if}
        </div>
      {/if}
    </main>
  {/if}

  <StatusBar
    source={client.source}
    connected={client.connected}
    result={query.result}
    elapsedMs={query.elapsedMs}
  />
</div>
