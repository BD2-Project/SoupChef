<script lang="ts">
  import type { PlanNode } from '../types/contract'

  interface Props {
    source: string
    connected: boolean
    plan?: PlanNode | null
  }

  let { source, connected, plan = null }: Props = $props()

  const sum = (node: PlanNode, key: 'disk_reads' | 'disk_writes'): number =>
    node[key] + node.children.reduce((total, child) => total + sum(child, key), 0)

  const format = (value: number) => value.toLocaleString('es-PE')

  const metrics = $derived([
    { label: 'filas', value: plan ? format(plan.rows) : '—' },
    { label: 'tiempo', value: plan ? `${format(plan.elapsed_ms)} ms` : '—' },
    { label: 'lecturas', value: plan ? format(sum(plan, 'disk_reads')) : '—' },
    { label: 'escrituras', value: plan ? format(sum(plan, 'disk_writes')) : '—' },
  ])
</script>

<footer
  class="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-sunken px-3 text-micro text-muted transition-colors duration-200"
>
  <div class="flex items-center gap-2">
    <span class="size-1.5 rounded-full {connected ? 'bg-accent' : 'bg-danger'}" aria-hidden="true"></span>
    <span>{source}</span>
  </div>
  <dl class="flex items-center gap-4 font-mono tabular">
    {#each metrics as metric (metric.label)}
      <div class="flex gap-1.5">
        <dt class="text-subtle">{metric.label}</dt>
        <dd class="text-text">{metric.value}</dd>
      </div>
    {/each}
  </dl>
</footer>
