<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import SqlEditor from '../components/SqlEditor.svelte'
  import { query } from '../query.svelte'

  let editor = $state<ReturnType<typeof SqlEditor>>()

  const shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl ↵'
  const error = $derived(query.result?.error ?? null)
</script>

<Panel title="Consulta">
  {#snippet meta()}
    {#if query.running}
      <span class="text-accent-text">ejecutando…</span>
    {/if}
  {/snippet}

  {#snippet actions()}
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
        onchange={(value) => (query.sql = value)}
        onrun={(statement) => query.run(statement)}
      />
    </div>

    {#if error}
      <div role="alert" class="flex shrink-0 items-baseline gap-2 border-t border-line bg-sunken px-3 py-2 text-micro">
        <span class="font-mono font-medium text-danger">{error.kind}</span>
        <span class="text-muted">{error.message}</span>
      </div>
    {/if}
  </div>
</Panel>
