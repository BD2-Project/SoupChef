<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import PlanNodeView from '../components/PlanNodeView.svelte'
  import { countNodes, maxCost } from '../plan'
  import { query } from '../query.svelte'

  const result = $derived(query.result)
  const plan = $derived(result?.plan ?? null)
  const max = $derived(plan ? maxCost(plan) : 0)
  const operators = $derived(plan ? countNodes(plan) : 0)
</script>

<Panel title="Plan de ejecución">
  {#snippet meta()}
    {#if plan}
      <span class="font-mono tabular">{operators} {operators === 1 ? 'operador' : 'operadores'}</span>
    {/if}
  {/snippet}

  {#if plan}
    {#key plan}
      <ul aria-label="Árbol de operadores" class="animate-rise px-1.5 py-2 [animation-duration:240ms]">
        <!-- Con un solo operador no hay nada con qué compararlo. -->
        <PlanNodeView node={plan} maxCost={max} highlight={operators > 1} />
      </ul>
    {/key}
  {:else if result?.error}
    <p class="px-3 py-3 text-subtle">Sin plan: la consulta terminó con error.</p>
  {:else}
    <p class="max-w-72 px-3 py-3 text-subtle">
      Cada operador muestra filas, tiempo y accesos a disco. El más costoso se resalta.
    </p>
  {/if}
</Panel>
