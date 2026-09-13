<script lang="ts">
  import StatusBar from './lib/components/StatusBar.svelte'
  import ThemeToggle from './lib/components/ThemeToggle.svelte'
  import FilesPanel from './lib/panels/FilesPanel.svelte'
  import PlanPanel from './lib/panels/PlanPanel.svelte'
  import QueryPanel from './lib/panels/QueryPanel.svelte'
  import ResultsPanel from './lib/panels/ResultsPanel.svelte'
  import { query } from './lib/query.svelte'

  query.loadTables()
</script>

<div class="flex h-full flex-col">
  <header
    class="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-sunken px-3 transition-colors duration-200"
  >
    <span class="text-ui font-semibold tracking-tight">Soup<span class="text-accent-text">Chef</span></span>
    <span class="h-4 w-px bg-line" aria-hidden="true"></span>
    <span class="text-micro text-subtle">cliente de SoupDB</span>
    <div class="ml-auto">
      <ThemeToggle />
    </div>
  </header>

  <!-- gap-px sobre bg-line dibuja divisores de 1px entre paneles, como en un IDE -->
  <main
    class="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_22rem] grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-px bg-line"
  >
    <div class="row-span-2 grid min-h-0 animate-rise"><FilesPanel /></div>
    <div class="grid min-h-0 animate-rise [animation-delay:60ms]"><QueryPanel /></div>
    <div class="row-span-2 grid min-h-0 animate-rise [animation-delay:180ms]"><PlanPanel /></div>
    <div class="grid min-h-0 animate-rise [animation-delay:120ms]"><ResultsPanel /></div>
  </main>

  <StatusBar source="SoupDB · mock" plan={query.result?.plan} />
</div>
