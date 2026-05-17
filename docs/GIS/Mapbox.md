# Mapbox GL JS — Layer & Style API Reference

> Quick reference for the Mapbox GL JS APIs this app uses. Targets **Mapbox GL JS v3** with **Mapbox Standard** styles.
>
> **What we run**: the web Mapbox runtime (`apps/web/src/map/runtime/mapbox/`) uses Mapbox GL JS v3 with custom **Mapbox Standard** styles. Standard changes how custom layers are placed (slots, not `beforeId`) and how terrain/lighting work — see the callouts below.

---

## Mapbox Standard — what's different

Mapbox Standard is a *fragment* style: its layers, sources, and `composite` data live inside an **import**, not in the root style. Consequences for our code:

- `map.getStyle().layers` does **not** list Standard's internal layers (roads, labels, etc.). You cannot filter them by `source === 'composite'` or hide them individually.
- Custom layers are positioned with **slots**, not a `beforeId`. Standard exposes three slots:
  - `bottom` — below everything (just above the base map background)
  - `middle` — above lines/roads, below labels and POI symbols
  - `top` — above everything
- Terrain and atmosphere (sky, fog, light) are part of the Standard style — see the Terrain and Lighting sections.

Our overlay code targets the `AppMapAdapter` interface, not the raw SDK — `addLayer(layer, { slot })`. The raster topo overlay uses `slot: 'middle'` (above roads, under labels).

---

## Layer Manipulation

### Adding layers (with a slot)

```js
// Mapbox Standard: place a custom layer via the `slot` property on the spec
map.addLayer({
  id: 'topo-raster-layer',
  type: 'raster',
  source: 'topo-raster-source',
  slot: 'middle',                 // above roads, below labels
  paint: { 'raster-opacity': 1 },
})

// Remove a layer
map.removeLayer('topo-raster-layer')
```

> `beforeId` and `moveLayer()` still exist, but on Standard you cannot reference its internal layer IDs — use a slot instead. `moveLayer` only helps reorder *your own* layers.

### Inspecting your own layers

```js
map.getLayer('topo-raster-layer')   // → spec | undefined  (layers you added)
map.getStyle().layers               // → only YOUR layers + slots; not Standard's internals
```

### Visibility / Paint / Layout / Filters

These work on layers **you** added (raster overlays, trip routes):

```js
map.setLayoutProperty('topo-raster-layer', 'visibility', 'none' /* | 'visible' */)
map.setPaintProperty('topo-raster-layer', 'raster-opacity', 0.5)
map.setFilter('trip-routes', ['==', 'difficulty', 'hard'])
map.setLayerZoomRange('trip-routes', 10, 22)

// Read back
map.getLayoutProperty(layerId, property)
map.getPaintProperty(layerId, property)
map.getFilter(layerId)
```

To restyle Standard's *own* basemap, use **config properties** instead (see Lighting).

---

## Sources

```js
map.addSource('topo-raster-source', {
  type: 'raster',
  tiles: ['https://.../{z}/{x}/{y}.png'],
  tileSize: 256,
  bounds: [west, south, east, north],   // limits tile requests to a bbox
  maxzoom: 18,
  attribution: '...',
})

map.getSource('topo-raster-source')     // → source | undefined
map.removeSource('topo-raster-source')  // remove dependent layers first
```

---

## Terrain & 3D

Mapbox Standard **ships terrain in the style — it is always on.** Two app-specific notes:

```js
// We re-assert terrain against our OWN dem source so the Settings slider can
// drive exaggeration (Standard's built-in exaggeration is a fixed expression).
map.addSource('app-terrain-dem', {
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14,
})
map.setTerrain({ source: 'app-terrain-dem', exaggeration: 1.5 })
```

> Referencing Standard's import-scoped `mapbox-dem` from the root logs a "terrain source not found" warning — hence the app-owned `app-terrain-dem` source.

**2D/3D button** = a camera-pitch toggle, **not** terrain on/off. `runtime/mapbox/terrain.ts` eases pitch between `0` (2D, top-down) and `60` (3D); terrain stays on throughout.

`setTerrain(null)` disables terrain, but the app never does this on Standard.

---

## Lighting & Atmosphere (Standard config)

Standard renders sky, fog, and light itself — **no custom `sky` layer is needed** (the app's old `sky-layer` was removed in Phase 3.5). Adjust the basemap via config properties on the `basemap` import:

```js
// Time-of-day lighting preset: 'dawn' | 'day' | 'dusk' | 'night'
map.setConfigProperty('basemap', 'lightPreset', 'day')

// Other Standard config knobs
map.setConfigProperty('basemap', 'show3dObjects', true)
map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
// also: showPlaceLabels, showRoadLabels, showTransitLabels, theme, font
```

> Classic `map.setFog()` / `map.setLight()` still exist for non-Standard styles, but Standard manages atmosphere through its own config — prefer `setConfigProperty`.

---

## Projection

```js
map.setProjection('globe')      // globe view (Settings toggle)
map.setProjection('mercator')   // flat map
```

The app toggles between `globe` and `mercator` from the Settings tab.

---

## Style Switching

The app keeps a season-aware pair of Standard styles; switching season or base layer is a full `setStyle()`:

```js
// Our style URLs — packages/map-core/src/styles.ts
const STYLES = {
  outdoorsSummer: 'mapbox://styles/kankava/cmp6x7gqn000o01skbescgqr3',
  outdoorsWinter: 'mapbox://styles/kankava/cmp6xadna002e01s81n7c055u',
  satellite:      'mapbox://styles/mapbox/standard-satellite',
}

map.setStyle(STYLES.outdoorsWinter, { diff: false }) // force full reload

// setStyle wipes sources/terrain — re-apply on style.load
map.once('style.load', () => {
  applyTerrain(map)   // re-assert app-terrain-dem
  // raster overlays re-add themselves via their own style.load listener
})
```

---

## Events

```js
map.on('load', handler)           // initial load complete
map.on('style.load', handler)     // style loaded (fires on setStyle too)
map.on('moveend', handler)        // viewport change complete → app syncs to mapStore
map.on('pitchend', handler)       // used by the 2D/3D control to track camera tilt
map.on('click', layerId, handler) // click on a specific layer's features

map.once('load', handler)         // fire once then auto-remove
map.off('moveend', handler)       // remove handler
```

---

## Raster Topo Overlays — how the app does it

Country topo maps (swisstopo, IGN, …) are raster tiles overlaid on the Standard basemap. Mapbox Standard makes this clean — **no base-layer hiding needed**:

```js
// 1. Add the raster source
map.addSource('topo-raster-source', { type: 'raster', tiles: [/* ... */], tileSize: 256 })

// 2. Add the raster layer into the `middle` slot — above roads, below labels.
//    Standard's labels and POIs stay on top automatically.
map.addLayer({
  id: 'topo-raster-layer',
  type: 'raster',
  source: 'topo-raster-source',
  slot: 'middle',
  paint: { 'raster-opacity': 1 },
})
```

The `middle` slot is the whole trick: the topo raster covers the basemap's roads and landuse while Standard's labels stay readable above it. The pre-Standard workarounds — enumerating `composite` layers to hide them, moving layers above the last symbol layer, dimming line opacity — are **obsolete** and were removed; Standard's internal layers aren't reachable that way anyway.

> **Diagnostic** — in the browser console (`__map` is exposed in dev builds): `__map.getStyle().layers` lists your slots + custom layers (not Standard's internals); `__map.getTerrain()` confirms the active terrain source.

---

## References

- [Mapbox GL JS API Reference](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Mapbox Standard & slots guide](https://docs.mapbox.com/map-styles/standard/guides/)
- [Mapbox Style Specification](https://docs.mapbox.com/style-spec/)
- [Mapbox GL JS Examples](https://docs.mapbox.com/mapbox-gl-js/example/)
