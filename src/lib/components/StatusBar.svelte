<script lang="ts">
  import type { PlanNode, QueryResult } from '../types/contract'

  interface Props {
    source: string
    connected: boolean
    result?: QueryResult | null
    elapsedMs?: number | null
  }

  let { source, connected, result = null, elapsedMs = null }: Props = $props()

  const sum = (node: PlanNode, key: 'disk_reads' | 'disk_writes'): number =>
    node[key] + node.children.reduce((total, child) => total + sum(child, key), 0)

  const format = (value: number) => value.toLocaleString('es-PE')

  const ok = $derived(result !== null && result.error === null)
  const plan = $derived(result?.plan ?? null)
  const rows = $derived(result && result.columns.length > 0 ? result.rows.length : (result?.affected_rows ?? 0))
  // Con plan se usa el tiempo del motor; sin plan, el medido en el cliente.
  const time = $derived(plan ? plan.elapsed_ms : elapsedMs)

  const metrics = $derived([
    { label: 'filas', value: ok ? format(rows) : '—', hint: undefined },
    { label: 'tiempo', value: ok && time !== null ? `${format(time)} ms` : '—', hint: undefined },
    {
      label: 'lecturas',
      value: plan ? format(sum(plan, 'disk_reads')) : '—',
      hint: plan ? undefined : 'Usa EXPLAIN ANALYZE para medir accesos a disco',
    },
    {
      label: 'escrituras',
      value: plan ? format(sum(plan, 'disk_writes')) : '—',
      hint: plan ? undefined : 'Usa EXPLAIN ANALYZE para medir accesos a disco',
    },
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
      <div class="flex gap-1.5" title={metric.hint}>
        <dt class="text-subtle">{metric.label}</dt>
        <dd class="text-text">{metric.value}</dd>
      </div>
    {/each}
  </dl>
</footer>
