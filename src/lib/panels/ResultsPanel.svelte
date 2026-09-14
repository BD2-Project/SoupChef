<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import PlanText from '../components/PlanText.svelte'
  import VirtualTable from '../components/VirtualTable.svelte'
  import { query } from '../query.svelte'

  const result = $derived(query.result)

  const format = (value: number) => value.toLocaleString('es-PE')
  const plural = (count: number, singular: string, many: string) => (count === 1 ? singular : many)
</script>

<Panel title="Resultados">
  {#snippet meta()}
    {#if result && !result.error}
      {#if result.plan}
        <span>plan de ejecución</span>
      {:else}
        <span class="font-mono tabular">
          {#if result.columns.length > 0}
            {format(result.rows.length)} {plural(result.rows.length, 'fila', 'filas')}
          {:else}
            {format(result.affected_rows)} {plural(result.affected_rows, 'afectada', 'afectadas')}
          {/if}
        </span>
      {/if}
    {/if}
  {/snippet}

  {#if !result}
    <p class="px-3 py-3 text-subtle">Ejecuta una consulta para ver sus filas.</p>
  {:else}
    {#key result}
      <div class="h-full animate-rise [animation-duration:240ms]">
        {#if result.error}
          <p class="px-3 py-3 text-subtle">La consulta terminó con error; el detalle está en el panel de consulta.</p>
        {:else if result.plan}
          <PlanText plan={result.plan} />
        {:else if result.columns.length === 0}
          <div class="px-3 py-3">
            <p class="font-mono text-ui text-text">
              Sentencia <span class="font-sans text-subtle">completada</span>
            </p>
            <p class="mt-1 text-subtle">
              <span class="font-mono text-text tabular">{format(result.affected_rows)}</span>
              {plural(result.affected_rows, 'fila afectada', 'filas afectadas')}
            </p>
          </div>
        {:else if result.rows.length === 0}
          <p class="px-3 py-3 text-subtle">La consulta no devolvió filas.</p>
        {:else}
          <VirtualTable columns={result.columns} rows={result.rows} />
        {/if}
      </div>
    {/key}
  {/if}
</Panel>
