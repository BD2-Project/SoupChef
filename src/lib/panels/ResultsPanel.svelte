<script lang="ts">
  import Panel from '../components/Panel.svelte'
</script>

<Panel title="Resultados">
  <div class="px-3 py-3 text-subtle">
    <p>Ejecuta una consulta para ver sus filas.</p>
    <p class="mt-1">
      Para probar volumen:
      <code class="font-mono text-accent-text">SELECT * FROM chunks LIMIT 100000</code>
    </p>
  </div>
</Panel>
