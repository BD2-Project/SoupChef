<script lang="ts">
  import { maxCost, planLines } from '../plan'
  import type { PlanNode } from '../types/contract'

  interface Props {
    plan: PlanNode
  }

  let { plan }: Props = $props()

  const lines = $derived(planLines(plan))
  const max = $derived(maxCost(plan))
  // Con un solo operador no hay nada con qué compararlo.
  const highlight = $derived(lines.length > 1)
</script>

<div class="h-full overflow-auto">
  <div role="list" aria-label="Plan de ejecución en texto" class="w-max min-w-full px-3 py-2.5 font-mono text-micro leading-6">
    {#each lines as line}
      {@const hottest = highlight && line.cost > 0 && line.cost === max}
      <div role="listitem" class="whitespace-pre {hottest ? 'text-heat-3' : 'text-text'}">
        {line.text}{#if hottest}<span class="ml-3 font-sans font-medium">← más costoso</span>{/if}
      </div>
    {/each}
  </div>
</div>
