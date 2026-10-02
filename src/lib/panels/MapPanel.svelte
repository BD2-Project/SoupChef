<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import MapView, { type MapMarker } from '../components/MapView.svelte'
  import { query } from '../query.svelte'
  import { formatMeters, isGeoPoint, parseSpatialQuery, pointColumnIndex } from '../spatial'
  import type { QueryResult } from '../types/contract'

  interface Props {
    result: QueryResult
  }

  let { result }: Props = $props()

  const spatial = $derived(parseSpatialQuery(query.lastStatement))
  const pointIndex = $derived(pointColumnIndex(result))

  const markers = $derived.by<MapMarker[]>(() => {
    if (pointIndex < 0) return []
    return result.rows.flatMap((row) => {
      const point = row[pointIndex]
      if (!isGeoPoint(point)) return []
      const label = String(row.find((value, index) => index !== pointIndex && typeof value === 'string') ?? '—')
      const detail = result.columns
        .map((column, index) => (index === pointIndex ? null : `${column}: ${row[index]}`))
        .filter((text): text is string => text !== null)
        .join(' · ')
      return [{ point, label, detail }]
    })
  })

  const summary = $derived(
    spatial?.radius !== undefined
      ? `radio de ${formatMeters(spatial.radius)}`
      : spatial?.k !== undefined
        ? `${spatial.k} vecinos más cercanos`
        : `${markers.length} ${markers.length === 1 ? 'punto' : 'puntos'}`,
  )
</script>

<Panel title="Mapa">
  {#snippet meta()}
    <span>{summary}</span>
  {/snippet}

  {#if markers.length === 0}
    <p class="px-3 py-3 text-subtle">La consulta no devolvió coordenadas.</p>
  {:else}
    <MapView
      {markers}
      center={spatial?.center ?? null}
      radius={spatial?.radius ?? null}
      ranked={spatial?.k !== undefined}
    />
  {/if}
</Panel>
