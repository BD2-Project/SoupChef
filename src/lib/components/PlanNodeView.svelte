<script lang="ts">
  import { formatDetailValue, heatOf, nodeCost, type Heat } from '../plan'
  import type { PlanNode } from '../types/contract'
  import PlanNodeView from './PlanNodeView.svelte'

  interface Props {
    node: PlanNode
    maxCost: number
    highlight: boolean
  }

  let { node, maxCost, highlight }: Props = $props()

  let expanded = $state(true)

  const cost = $derived(nodeCost(node))
  const heat = $derived(heatOf(cost, maxCost))
  const ratio = $derived(maxCost > 0 ? cost / maxCost : 0)
  const hottest = $derived(highlight && cost > 0 && cost === maxCost)
  const details = $derived(Object.entries(node.detail))
  const hasChildren = $derived(node.children.length > 0)

  const format = (value: number) => value.toLocaleString('es-PE')

  const HEAT_BAR: Record<Heat, string> = {
    0: 'bg-line-strong',
    1: 'bg-heat-1',
    2: 'bg-heat-2',
    3: 'bg-heat-3',
  }
</script>

<li>
  <div
    class="rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-raised {hottest ? 'bg-heat-3/8' : ''}"
  >
    <div class="flex items-center gap-1.5">
      {#if hasChildren}
        <button
          type="button"
          onclick={() => (expanded = !expanded)}
          aria-expanded={expanded}
          aria-label="{expanded ? 'Contraer' : 'Expandir'} {node.op}"
          class="grid size-4 shrink-0 place-items-center rounded-sm text-subtle transition-colors duration-150 hover:text-text"
        >
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            class="size-3 transition-transform duration-200 ease-out-quart {expanded ? 'rotate-90' : ''}"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4.5 3l3 3-3 3" />
          </svg>
        </button>
      {:else}
        <span class="size-4 shrink-0" aria-hidden="true"></span>
      {/if}

      <span class="truncate font-mono text-ui font-medium text-text">{node.op}</span>

      {#if hottest}
        <span class="ml-auto shrink-0 rounded-sm px-1.5 text-micro font-medium text-heat-3 ring-1 ring-heat-3/40">
          más costoso
        </span>
      {/if}
    </div>

    <div class="ml-5.5">
      {#if details.length > 0}
        <dl class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-micro">
          {#each details as [key, value] (key)}
            <div class="flex min-w-0 gap-1">
              <dt class="shrink-0 text-subtle">{key}</dt>
              <dd class="truncate font-mono text-muted">{formatDetailValue(value)}</dd>
            </div>
          {/each}
        </dl>
      {/if}

      <dl class="mt-1 flex flex-wrap gap-x-3 font-mono text-micro tabular">
        <div class="flex gap-1">
          <dd class="text-text">{format(node.rows)}</dd>
          <dt class="text-subtle">filas</dt>
        </div>
        <div class="flex gap-1">
          <dd class="text-text">{format(node.elapsed_ms)}</dd>
          <dt class="text-subtle">ms</dt>
        </div>
        <div class="flex gap-1">
          <dd class="text-text">{format(node.disk_reads)}</dd>
          <dt class="text-subtle" title="lecturas a disco">lect.</dt>
        </div>
        <div class="flex gap-1">
          <dd class="text-text">{format(node.disk_writes)}</dd>
          <dt class="text-subtle" title="escrituras a disco">escr.</dt>
        </div>
      </dl>

      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-line/60" aria-hidden="true">
        <div
          class="h-full origin-left rounded-full transition-transform duration-300 ease-out-quart {HEAT_BAR[heat]}"
          style:transform="scaleX({ratio})"
        ></div>
      </div>
    </div>
  </div>

  {#if hasChildren}
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out-quart {expanded
        ? 'grid-rows-[1fr]'
        : 'grid-rows-[0fr]'}"
    >
      <ul class="ml-3.5 min-h-0 overflow-hidden border-l border-line pl-2" inert={!expanded}>
        {#each node.children as child}
          <PlanNodeView node={child} {maxCost} {highlight} />
        {/each}
      </ul>
    </div>
  {/if}
</li>
