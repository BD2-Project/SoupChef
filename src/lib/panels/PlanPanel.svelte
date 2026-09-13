<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import PlanDiagram from '../components/PlanDiagram.svelte'
  import PlanNodeView from '../components/PlanNodeView.svelte'
  import { countNodes, maxCost } from '../plan'
  import type { PlanNode } from '../types/contract'

  interface Props {
    plan: PlanNode
  }

  let { plan }: Props = $props()

  type View = 'diagram' | 'detail'

  const VIEWS: { id: View; label: string }[] = [
    { id: 'diagram', label: 'Diagrama' },
    { id: 'detail', label: 'Detalle' },
  ]

  let view = $state<View>('diagram')

  const max = $derived(maxCost(plan))
  const operators = $derived(countNodes(plan))
  // Con un solo operador no hay nada con qué compararlo.
  const highlight = $derived(operators > 1)
</script>

<Panel title="Plan de ejecución">
  {#snippet meta()}
    <span class="font-mono tabular">{operators} {operators === 1 ? 'operador' : 'operadores'}</span>
  {/snippet}

  {#snippet actions()}
    <div role="group" aria-label="Vista del plan" class="flex rounded-md bg-sunken p-0.5 ring-1 ring-line">
      {#each VIEWS as option (option.id)}
        <button
          type="button"
          aria-pressed={view === option.id}
          onclick={() => (view = option.id)}
          class="rounded-[5px] px-2 py-0.5 text-micro transition-colors duration-150 {view === option.id
            ? 'bg-surface font-medium text-text'
            : 'text-subtle hover:text-text'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/snippet}

  {#key plan}
    {#if view === 'diagram'}
      <div class="p-2">
        <PlanDiagram {plan} maxCost={max} {highlight} />
      </div>
    {:else}
      <ul aria-label="Árbol de operadores" class="animate-rise px-1.5 py-2 [animation-duration:240ms]">
        <PlanNodeView node={plan} maxCost={max} {highlight} />
      </ul>
    {/if}
  {/key}
</Panel>
