<script lang="ts">
  import { formatDetailValue, heatOf, layoutPlan, summarizeDetail, type Heat } from '../plan'
  import type { PlanNode } from '../types/contract'

  interface Props {
    plan: PlanNode
    maxCost: number
    highlight: boolean
  }

  let { plan, maxCost, highlight }: Props = $props()

  const NODE_W = 188
  const NODE_H = 62
  const GAP_X = 20
  const GAP_Y = 38
  const PAD = 10

  const uid = $props.id()
  const arrowId = `${uid}-arrow`

  const layout = $derived(layoutPlan(plan))
  const width = $derived(PAD * 2 + layout.columns * NODE_W + (layout.columns - 1) * GAP_X)
  const height = $derived(PAD * 2 + layout.levels * NODE_H + (layout.levels - 1) * GAP_Y)
  const maxRows = $derived(Math.max(1, ...layout.edges.map((edge) => edge.rows)))
  const description = $derived(
    [...layout.nodes]
      .sort((a, b) => a.y - b.y)
      .map((placed) => placed.node.op)
      .join(' → '),
  )

  const left = (x: number) => PAD + x * (NODE_W + GAP_X)
  const top = (y: number) => PAD + y * (NODE_H + GAP_Y)
  const format = (value: number) => value.toLocaleString('es-PE')
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

  // Grosor según las filas que suben por la arista: se ve dónde el plan mueve más datos.
  const strokeFor = (rows: number) => 1.25 + 3.25 * (Math.log10(rows + 1) / Math.log10(maxRows + 1))

  const HEAT_STROKE: Record<Heat, string> = {
    0: 'var(--line-strong)',
    1: 'var(--heat-1)',
    2: 'var(--heat-2)',
    3: 'var(--heat-3)',
  }

  const tooltip = (node: PlanNode) => {
    const detail = Object.entries(node.detail)
      .map(([key, value]) => `${key}: ${formatDetailValue(value)}`)
      .join(', ')
    return detail ? `${node.op} — ${detail}` : node.op
  }
</script>

<div class="overflow-auto">
  <svg
    role="img"
    aria-label="Diagrama del plan: {description}"
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    class="mx-auto block font-mono"
  >
    <defs>
      <marker
        id={arrowId}
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="8"
        markerHeight="8"
        markerUnits="userSpaceOnUse"
        orient="auto"
      >
        <path d="M0 0 L8 4 L0 8 z" fill="var(--line-strong)" />
      </marker>
    </defs>

    {#each layout.edges as edge}
      {@const x1 = left(edge.from.x) + NODE_W / 2}
      {@const y1 = top(edge.from.y)}
      {@const x2 = left(edge.to.x) + NODE_W / 2}
      {@const y2 = top(edge.to.y) + NODE_H}
      {@const mid = (y1 + y2) / 2}
      <g class="animate-rise" style:animation-delay="{edge.to.y * 60 + 40}ms">
        <path
          d="M{x1} {y1} C{x1} {mid}, {x2} {mid}, {x2} {y2 + 1}"
          fill="none"
          stroke="var(--line-strong)"
          stroke-width={strokeFor(edge.rows)}
          stroke-linecap="round"
          marker-end="url(#{arrowId})"
        />
        <text x={x1 + 8} y={mid + 3.5} class="fill-subtle text-[10px]">{format(edge.rows)} filas</text>
      </g>
    {/each}

    {#each layout.nodes as placed}
      {@const heat = heatOf(placed.cost, maxCost)}
      {@const hottest = highlight && placed.cost > 0 && placed.cost === maxCost}
      <g transform="translate({left(placed.x)} {top(placed.y)})">
        <g class="animate-rise" style:animation-delay="{placed.y * 60}ms">
          <title>{tooltip(placed.node)}</title>
          <rect
            width={NODE_W}
            height={NODE_H}
            rx="6"
            fill={hottest ? 'color-mix(in oklch, var(--heat-3) 10%, var(--surface))' : 'var(--surface)'}
            stroke={HEAT_STROKE[heat]}
            stroke-width={hottest ? 2 : 1}
          />
          <text x="12" y="21" class="fill-text text-[12px] font-semibold">
            {clip(placed.node.op, hottest ? 14 : 22)}
          </text>
          {#if hottest}
            <text x={NODE_W - 10} y="21" text-anchor="end" class="fill-heat-3 font-sans text-[10px] font-medium">
              más costoso
            </text>
          {/if}
          <text x="12" y="37" class="fill-muted text-[10.5px]">{clip(summarizeDetail(placed.node.detail), 27)}</text>
          <text x="12" y="53" class="fill-subtle text-[10.5px]">
            <tspan class="fill-text">{format(placed.node.disk_reads)}</tspan> lect ·
            <tspan class="fill-text">{format(placed.node.disk_writes)}</tspan> escr
          </text>
        </g>
      </g>
    {/each}
  </svg>
</div>
