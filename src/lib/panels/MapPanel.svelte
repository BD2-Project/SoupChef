<script lang="ts">
  import Panel from '../components/Panel.svelte'
  import MapView, { type MapMarker } from '../components/MapView.svelte'
  import { query } from '../query.svelte'
  import {
    formatDegrees,
    formatMeters,
    isGeoPoint,
    METERS_PER_DEGREE,
    parsePolygon,
    parseSpatialQuery,
    pointColumnIndex,
  } from '../spatial'
  import type { QueryResult } from '../types/contract'

  interface Props {
    result: QueryResult
  }

  let { result }: Props = $props()

  const spatial = $derived(parseSpatialQuery(query.lastStatement))
  const polygon = $derived(parsePolygon(query.lastStatement))
  const pointIndex = $derived(pointColumnIndex(result))

  const markers = $derived.by<MapMarker[]>(() => {
    if (pointIndex < 0) return []
    return result.rows.flatMap((row, rowIndex) => {
      const point = row[pointIndex]
      if (!isGeoPoint(point)) return []
      const label = String(row.find((value, index) => index !== pointIndex && typeof value === 'string') ?? '—')
      const detail = result.columns
        .map((column, index) => (index === pointIndex ? null : `${column}: ${row[index]}`))
        .filter((text): text is string => text !== null)
        .join(' · ')
      return [{ point, label, detail, rowIndex }]
    })
  })

  const summary = $derived(
    spatial?.radius !== undefined
      ? `radio de ${spatial.unit === 'deg' ? formatDegrees(spatial.radius) : formatMeters(spatial.radius)}`
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
      radius={spatial?.radius === undefined
        ? null
        : spatial.unit === 'deg'
          ? spatial.radius * METERS_PER_DEGREE
          : spatial.radius}
      ranked={spatial?.k !== undefined}
      {polygon}
    />
  {/if}
</Panel>
