<script lang="ts">
  import { onMount } from 'svelte'
  import 'leaflet/dist/leaflet.css'

  import { highlight } from '../highlight.svelte'
  import { formatMeters, formatPoint, haversineMeters, type Polygon } from '../spatial'
  import { theme } from '../theme.svelte'
  import type { GeoPoint } from '../types/contract'

  export interface MapMarker {
    point: GeoPoint
    label: string
    detail: string
    /** Índice en `result.rows`: con él se resalta la fila correspondiente. */
    rowIndex: number
  }

  interface Props {
    markers: MapMarker[]
    center?: GeoPoint | null
    radius?: number | null
    /** k-NN numera los vecinos por cercanía; el radio dibuja el círculo. */
    ranked?: boolean
    /** Región de `intersects(...)`: se dibuja para ver qué quedó dentro. */
    polygon?: Polygon | null
  }

  let { markers, center = null, radius = null, ranked = false, polygon = null }: Props = $props()

  // Tiles de OpenStreetMap: libres y sin API key. Para el tema oscuro se invierten
  // por CSS en vez de usar un proveedor aparte que exija registrarse.
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const ATTRIBUTION = '&copy; colaboradores de OpenStreetMap'

  type LeafletModule = typeof import('leaflet')

  let container: HTMLDivElement | undefined = $state()
  // Leaflet toca `window` al importarse: se carga dinámicamente solo en el cliente.
  let L: LeafletModule | undefined
  let map: import('leaflet').Map | undefined
  let tiles: import('leaflet').TileLayer | undefined
  let overlay: import('leaflet').LayerGroup | undefined
  // Se guardan por fila para poder resaltar sin volver a dibujar todo el mapa.
  let circles = new Map<number, import('leaflet').CircleMarker>()

  function style(name: '--accent' | '--heat-3' | '--muted' | '--surface'): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  }

  function draw() {
    if (!L || !map || !overlay) return
    overlay.clearLayers()
    circles = new Map()

    // El polígono se dibuja primero para que quede por debajo de los marcadores.
    if (polygon && polygon.length >= 3) {
      L.polygon(
        polygon.map((vertex) => [vertex.y, vertex.x] as import('leaflet').LatLngExpression),
        {
          color: style('--heat-3'),
          weight: 1.5,
          dashArray: '6 4',
          fillColor: style('--heat-3'),
          fillOpacity: 0.08,
        },
      ).addTo(overlay)
    }

    const accent = style('--accent')
    const hot = style('--heat-3')
    const surface = style('--surface')

    for (const [index, marker] of markers.entries()) {
      const circle = L.circleMarker([marker.point.y, marker.point.x], {
        radius: ranked ? 9 : 6,
        color: surface,
        weight: 1.5,
        fillColor: accent,
        fillOpacity: 0.9,
      })
      const distance = center ? ` · ${formatMeters(haversineMeters(center, marker.point))}` : ''
      circle.bindPopup(
        `<strong>${marker.label}</strong><br>${marker.detail}<br>${formatPoint(marker.point)}${distance}`,
      )
      if (ranked) {
        circle.bindTooltip(String(index + 1), {
          permanent: true,
          direction: 'center',
          className: 'soup-rank',
        })
      }
      circle.on('mouseover', () => highlight.set(marker.rowIndex, 'map'))
      circle.on('mouseout', () => highlight.clear())
      circles.set(marker.rowIndex, circle)
      circle.addTo(overlay)
    }

    if (center) {
      L.circleMarker([center.y, center.x], {
        radius: 7,
        color: hot,
        weight: 3,
        fillColor: hot,
        fillOpacity: 0.35,
      })
        .bindPopup(`Punto de consulta<br>${formatPoint(center)}`)
        .addTo(overlay)

      if (radius) {
        L.circle([center.y, center.x], {
          radius,
          color: hot,
          weight: 1.5,
          dashArray: '6 4',
          fillColor: hot,
          fillOpacity: 0.06,
        }).addTo(overlay)
      }

      // Une cada vecino con el punto de consulta: se ve de dónde sale el orden.
      if (ranked) {
        for (const marker of markers) {
          L.polyline(
            [
              [center.y, center.x],
              [marker.point.y, marker.point.x],
            ],
            { color: hot, weight: 1, opacity: 0.35 },
          ).addTo(overlay)
        }
      }
    }

    fit()
  }

  function fit() {
    if (!L || !map) return
    const positions: import('leaflet').LatLngExpression[] = markers.map((marker) => [
      marker.point.y,
      marker.point.x,
    ])
    if (center) positions.push([center.y, center.x])
    // El encuadre incluye la región aunque no haya ningún punto dentro.
    if (polygon) {
      positions.push(...polygon.map((vertex) => [vertex.y, vertex.x] as import('leaflet').LatLngExpression))
    }
    if (positions.length === 0) return

    const bounds = L.latLngBounds(positions)
    if (radius && center) {
      bounds.extend(L.latLng(center.y, center.x).toBounds(radius * 2))
    }
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
  }

  onMount(() => {
    let disposed = false
    let observer: ResizeObserver | undefined

    void import('leaflet').then((leaflet) => {
      if (disposed || !container) return
      L = leaflet
      map = leaflet.map(container, { attributionControl: true, zoomControl: true, preferCanvas: true })
      map.setView([-12.0464, -77.0428], 12)
      tiles = leaflet.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map)
      overlay = leaflet.layerGroup().addTo(map)

      // El panel cambia de tamaño al aparecer o al redimensionar la ventana.
      observer = new ResizeObserver(() => map?.invalidateSize())
      observer.observe(container)
      draw()
    })

    return () => {
      disposed = true
      observer?.disconnect()
      map?.remove()
      map = undefined
      tiles = undefined
      overlay = undefined
      circles.clear()
    }
  })

  $effect(() => {
    // Se vuelve a dibujar cuando cambian los resultados o el punto de consulta.
    void markers
    void center
    void radius
    void ranked
    void polygon
    draw()
  })

  $effect(() => {
    const active = highlight.row
    if (!L) return
    const accent = style('--accent')
    const hot = style('--heat-3')
    const surface = style('--surface')

    for (const [rowIndex, circle] of circles) {
      const on = rowIndex === active
      circle.setStyle({ fillColor: on ? hot : accent, color: on ? hot : surface, weight: on ? 3 : 1.5 })
      circle.setRadius(on ? (ranked ? 12 : 9) : ranked ? 9 : 6)
      if (on) circle.bringToFront()
    }
  })

  const darkTiles = $derived(theme.current === 'dark')
</script>

<div bind:this={container} class="h-full min-h-0 w-full" class:dark-tiles={darkTiles}></div>

<style>
  /* El mapa claro se invierte para el tema oscuro: OSM no publica tiles oscuros. */
  .dark-tiles :global(.leaflet-tile-pane) {
    filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9);
  }

  /* Leaflet inyecta su propio DOM: estos estilos son globales a propósito. */
  :global(.leaflet-container) {
    background: var(--sunken);
    font-family: var(--font-sans);
    font-size: var(--text-micro);
  }

  :global(.leaflet-popup-content-wrapper),
  :global(.leaflet-popup-tip) {
    background: var(--surface);
    color: var(--text);
    border-radius: 6px;
    box-shadow: none;
    border: 1px solid var(--line-strong);
  }

  :global(.leaflet-control-zoom a) {
    background: var(--surface);
    color: var(--text);
    border-color: var(--line);
  }

  :global(.leaflet-control-attribution) {
    background: color-mix(in oklch, var(--surface) 80%, transparent);
    color: var(--subtle);
  }

  :global(.soup-rank) {
    background: transparent;
    border: none;
    box-shadow: none;
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 10px;
  }

  :global(.soup-rank::before) {
    display: none;
  }
</style>
