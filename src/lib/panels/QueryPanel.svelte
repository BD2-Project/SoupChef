<script lang="ts">
  import { client } from '../client'
  import { EXAMPLES } from '../examples'
  import Panel from '../components/Panel.svelte'
  import SqlEditor from '../components/SqlEditor.svelte'
  import { query } from '../query.svelte'

  let editor = $state<ReturnType<typeof SqlEditor>>()

  const shortcut =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl ↵'
  const error = $derived(query.result?.error ?? null)

  function loadExample(event: Event) {
    const select = event.currentTarget as HTMLSelectElement
    const example = EXAMPLES[Number(select.value)]
    if (example) query.sql = example.sql
    // Vuelve al placeholder: elegir dos veces el mismo ejemplo debe reescribirlo.
    select.value = ''
  }
</script>

<Panel title="Consulta">
  {#snippet meta()}
    {#if query.running}
      <span class="text-accent-text">ejecutando…</span>
    {:else if !query.result?.plan}
      <span>antepón <code class="font-mono text-muted">EXPLAIN ANALYZE</code> para ver el plan</span>
    {/if}
  {/snippet}

  {#snippet actions()}
    <select
      aria-label="Ejemplos de consulta"
      class="h-6 max-w-40 rounded-md border border-line bg-surface px-1.5 text-micro text-muted transition-colors duration-150 hover:text-text focus:border-accent focus:outline-none"
      onchange={loadExample}
    >
      <option value="" selected>Ejemplos…</option>
      {#each EXAMPLES as example, index (example.label)}
        <option value={index}>{example.label}</option>
      {/each}
    </select>

    {#if client.prepared}
      <button
        type="button"
        onclick={() => query.runPreparedDemo()}
        disabled={query.running}
        title="Prepara SELECT … WHERE id = $1 y la ejecuta dos veces"
        class="inline-flex h-6 items-center rounded-md border border-line px-2 text-micro font-medium text-muted transition-colors duration-150 hover:bg-raised hover:text-text disabled:cursor-progress disabled:opacity-60"
      >
        Prepared
      </button>
    {/if}

    <button
      type="button"
      onclick={() => query.run(editor?.getStatement())}
      disabled={query.running}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      class="inline-flex h-6 items-center gap-2 rounded-md bg-accent px-2.5 text-micro font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-progress disabled:opacity-60"
    >
      Ejecutar
      <kbd class="font-mono text-[0.625rem] font-medium opacity-70">{shortcut}</kbd>
    </button>
  {/snippet}

  <div class="relative flex h-full min-h-0 flex-col">
    <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" aria-hidden="true">
      {#if query.running}
        <div class="h-full w-1/3 animate-scan bg-accent"></div>
      {/if}
    </div>

    <div class="min-h-0 flex-1">
      <SqlEditor
        bind:this={editor}
        value={query.sql}
        tables={query.tables}
        plugins={query.plugins}
        onchange={(value) => (query.sql = value)}
        onrun={(statement) => query.run(statement)}
      />
    </div>

    {#if query.preparedNote}
      <div class="flex shrink-0 items-baseline gap-2 border-t border-line bg-sunken px-3 py-2 text-micro">
        <span class="font-mono font-medium text-accent-text">prepared</span>
        <span class="text-muted">{query.preparedNote}</span>
      </div>
    {/if}

    {#if error}
      <div role="alert" class="flex shrink-0 items-baseline gap-2 border-t border-line bg-sunken px-3 py-2 text-micro">
        <span class="font-mono font-medium text-danger">{error.kind}</span>
        <span class="text-muted">{error.message}</span>
      </div>
    {/if}
  </div>
</Panel>
