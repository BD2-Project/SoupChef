<script lang="ts">
  import Panel from '../components/Panel.svelte'
</script>

<Panel title="Consulta">
  {#snippet actions()}
    <button
      type="button"
      disabled
      class="inline-flex h-6 items-center gap-2 rounded-md bg-accent px-2.5 text-micro font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      Ejecutar
      <kbd class="font-mono text-[0.625rem] font-medium opacity-70">⌘↵</kbd>
    </button>
  {/snippet}
  <pre class="px-3 py-3 font-mono text-ui text-muted">SELECT * FROM papers WHERE id = 42;</pre>
</Panel>
