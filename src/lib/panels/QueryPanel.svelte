<script lang="ts">
  import Panel from '../components/Panel.svelte'
</script>

<Panel title="Consulta">
  {#snippet actions()}
    <button
      type="button"
      disabled
      class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
    >
      Ejecutar
    </button>
  {/snippet}
  <p class="p-3 font-mono text-sm text-slate-500">SELECT * FROM papers WHERE id = 42;</p>
</Panel>
