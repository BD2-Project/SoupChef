<script lang="ts">
  import FilesPanel from './lib/panels/FilesPanel.svelte'
  import PlanPanel from './lib/panels/PlanPanel.svelte'
  import QueryPanel from './lib/panels/QueryPanel.svelte'
  import ResultsPanel from './lib/panels/ResultsPanel.svelte'
</script>

<div class="flex h-full flex-col bg-slate-950 text-slate-200">
  <header class="flex h-11 shrink-0 items-center border-b border-slate-800 px-4">
    <h1 class="text-sm font-semibold">SoupChef</h1>
    <span class="ml-2 text-xs text-slate-500">cliente de SoupDB</span>
  </header>

  <main
    class="grid min-h-0 flex-1 gap-2 p-2 grid-cols-[16rem_minmax(0,1fr)_22rem] grid-rows-[minmax(0,2fr)_minmax(0,3fr)]"
  >
    <div class="row-span-2 grid min-h-0"><FilesPanel /></div>
    <div class="grid min-h-0"><QueryPanel /></div>
    <div class="row-span-2 grid min-h-0"><PlanPanel /></div>
    <div class="grid min-h-0"><ResultsPanel /></div>
  </main>
</div>
