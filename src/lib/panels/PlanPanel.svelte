<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import PlanDiagram from '../components/PlanDiagram.svelte'
  import { countNodes, maxCost } from '../plan'
  import type { PlanNode } from '../types/contract'

  interface Props {
    plan: PlanNode
  }

  let { plan }: Props = $props()

  const max = $derived(maxCost(plan))
  const operators = $derived(countNodes(plan))
  // Con un solo operador no hay nada con qué compararlo.
  const highlight = $derived(operators > 1)
</script>

<Panel title="Plan de ejecución">
  {#snippet meta()}
    <span class="font-mono tabular">{operators} {operators === 1 ? 'operador' : 'operadores'}</span>
  {/snippet}

  {#key plan}
    <div class="p-2">
      <PlanDiagram {plan} maxCost={max} {highlight} />
    </div>
  {/key}
</Panel>
