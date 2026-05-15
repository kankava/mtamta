# MapTiler SDK / MapLibre GL JS — Layer & Style API Reference

> Quick reference for layer manipulation, style control, and rendering APIs relevant to our use cases. MapTiler SDK wraps MapLibre GL JS — most MapLibre APIs work directly on the MapTiler map instance.
>
> **Primary use case**: Controlling base map layer visibility when country topo overlays are active.

---

## Layer Manipulation

### Inspecting Layers

```js
// Get all layers in the current style
map.getStyle().layers
// → [{ id: 'background', type: 'background', ... }, { id: 'landuse', type: 'fill', ... }, ...]

// Get a single layer spec
map.getLayer('road-primary')
// → { id: 'road-primary', type: 'line', source: 'openmaptiles', ... } | undefined

// Get ordered list of layer IDs (MapLibre-specific, not in Mapbox)
map.getLayersOrder()
// → ['background', 'landuse', 'waterway', 'road-primary', ...]
```

### Adding / Removing / Moving Layers

```js
// Add a layer (optionally before another layer)
map.addLayer(layerSpec, beforeId?)

// Remove a layer
map.removeLayer('my-layer')

// Move a layer in the stack
map.moveLayer('my-layer', 'before-this-layer')
// Moves 'my-layer' directly below 'before-this-layer'
// If beforeId is omitted, moves to top of stack
```

### Visibility

```js
// Hide a layer
map.setLayoutProperty('road-primary', 'visibility', 'none')

// Show a layer
map.setLayoutProperty('road-primary', 'visibility', 'visible')

// Check current visibility
map.getLayoutProperty('road-primary', 'visibility')
// → 'visible' | 'none'
```

### Paint Properties

```js
// Change fill opacity
map.setPaintProperty('landuse-park', 'fill-opacity', 0.3)

// Change line color
map.setPaintProperty('road-primary', 'line-color', '#ff0000')

// Change line opacity
map.setPaintProperty('road-primary', 'line-opacity', 0.5)

// Read current paint property
map.getPaintProperty('road-primary', 'line-color')
```

### Layout Properties

```js
// Change text size
map.setLayoutProperty('place-city', 'text-size', 14)

// Any layout property from the MapLibre style spec
map.setLayoutProperty(layerId, property, value)
map.getLayoutProperty(layerId, property)
```

### Filters

```js
// Set a filter on a layer
map.setFilter('road-primary', ['==', 'class', 'motorway'])

// Remove filter
map.setFilter('road-primary', null)

// Get current filter
map.getFilter('road-primary')
```

### Zoom Range

```js
// Restrict layer to zoom levels 10–16
map.setLayerZoomRange('my-layer', 10, 16)
```

---

## Sources

```js
// Add a raster source
map.addSource('my-topo', {
  type: 'raster',
  tiles: ['https://example.com/tiles/{z}/{x}/{y}.png'],
  tileSize: 256,
  bounds: [west, south, east, north], // limits tile requests to bbox
  maxzoom: 18,
  attribution: '...',
})

// Check if source exists
map.getSource('my-topo') // → source object | undefined

// Remove source (must remove all layers using it first)
map.removeSource('my-topo')
```

---

## Terrain & 3D

### MapTiler SDK Terrain API (preferred)

```js
// Enable terrain with exaggeration
map.enableTerrain(1.5)

// Disable terrain
map.disableTerrain()
```

The SDK manages the terrain DEM source internally — no need to add a source manually.

### Raw MapLibre Terrain API (also available)

```js
// Manual terrain source + terrain setup
map.addSource('terrain-dem', {
  type: 'raster-dem',
  url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json',
  tileSize: 512,
})

map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })

// Disable
map.setTerrain(null)
```

### Sky

```js
// MapLibre uses setSky (not addLayer like Mapbox)
map.setSky({
  'sky-color': '#89CFF0',
  'horizon-color': '#ffffff',
  'fog-color': '#ffffff',
  'sky-horizon-blend': 0.5,
  'horizon-fog-blend': 0.5,
  'fog-ground-blend': 0.5,
})
```

---

## Projection

```js
// Globe view (MapLibre v4+ / MapTiler SDK)
map.setProjection({ type: 'globe' })

// Standard flat map
map.setProjection({ type: 'mercator' })

// NOTE: MapLibre uses object syntax { type: '...' }
// Mapbox uses string syntax 'globe'
// Must wait for style to load before calling setProjection
```

---

## MapTiler Styles

MapTiler provides pre-built styles accessible by ID:

| Style ID | Description | Use Case |
|----------|-------------|----------|
| `outdoor-v2` | Outdoors with trails, contours, shading | Global summer basemap |
| `winter-v2` | Winter palette, pistes, lifts, avalanche zones | Global winter basemap |
| `satellite` | Satellite imagery with labels | Satellite basemap |
| `topo-v2` | Operational/SAR-focused topo | Future: "Map Style" option in Settings |
| `streets-v2` | Standard streets | Not used |
| `basic-v2` | Minimal clean map | Not used |

### Style Resolution (our implementation)

```ts
// packages/map-core/src/styles.ts
const MAPTILER_STYLE_IDS = {
  outdoors: { summer: 'outdoor-v2', winter: 'winter-v2' },
  satellite: { summer: 'satellite', winter: 'satellite' },
}

function resolveMaptilerStyle(baseLayer, season) {
  return MAPTILER_STYLE_IDS[baseLayer]?.[season] ?? 'outdoor-v2'
}
```

### topo-v2 (future consideration)

`topo-v2` is orthogonal to the season axis — it's a rendering style, not a seasonal variant. Could be added as a "Map Style" preference in Settings that overrides the base style for both seasons. This would replace `outdoor-v2`/`winter-v2` with `topo-v2` as the base, while still using the same country topo overlays and satellite option.

---

## Style Switching

```js
// Full style swap — use string ID for MapTiler styles
map.setStyle('outdoor-v2')

// Or full URL
map.setStyle('https://api.maptiler.com/maps/outdoor-v2/style.json?key=...')

// With options
map.setStyle(style, { diff: false }) // force full reload

// Events
map.on('style.load', () => {
  // Re-apply terrain, overlays, custom layers after style swap
})
```

---

## Events

```js
map.on('load', handler)        // initial load complete
map.on('style.load', handler)  // style loaded (fires on setStyle too)
map.on('moveend', handler)     // viewport change complete
map.on('click', handler)       // map click
map.on('click', layerId, handler) // click on specific layer features

map.once('load', handler)      // fire once then auto-remove
map.off('click', handler)      // remove handler
```

---

## MapTiler SDK Extras (beyond MapLibre)

```js
// Built-in geocoding
const result = await maptilersdk.geocoding.forward('Zermatt')

// Built-in weather (requires weather API access)
// Available but not yet integrated — M3 scope

// Language auto-detection for labels
maptilersdk.config.primaryLanguage = maptilersdk.Language.AUTO
```

---

## Useful for Topo Overlay Work

### Problem: Base Map Layers Bleeding Through Topo Overlay

Same issue as Mapbox — raster topo inserted before first symbol layer, but some base map line/fill features render above it because they're interleaved with symbol layers.

MapTiler/MapLibre styles use `openmaptiles` as the default vector source name (vs `composite` in Mapbox).

### Option 1: Hide Base Map Layers Under Topo

```js
// Find all fill and line layers from the base style
const baseLayers = map.getStyle().layers.filter(l =>
  (l.type === 'fill' || l.type === 'line') &&
  l.source === 'openmaptiles' // MapTiler's default source name
)

// Hide them when topo overlay is active
for (const layer of baseLayers) {
  map.setLayoutProperty(layer.id, 'visibility', 'none')
}

// Restore when topo overlay is removed
for (const layer of baseLayers) {
  map.setLayoutProperty(layer.id, 'visibility', 'visible')
}
```

### Option 2: Move Topo Overlay Higher in Stack

```js
// Insert topo raster above ALL base layers
const lastSymbolLayer = map.getStyle().layers
  .filter(l => l.type === 'symbol')
  .pop()

map.moveLayer('topo-raster', lastSymbolLayer?.id)
```

### Option 3: Reduce Opacity of Conflicting Layers

```js
const lineLayerIds = map.getStyle().layers
  .filter(l => l.type === 'line' && l.source === 'openmaptiles')
  .map(l => l.id)

for (const id of lineLayerIds) {
  map.setPaintProperty(id, 'line-opacity', 0.2)
}
```

### Option 4: Filter Base Layers by Zoom

```js
map.setLayerZoomRange('road-primary', 16, 22)
```

### Diagnostic: Inspect Layer Stack in Console

```js
// Full layer stack with types
map.getStyle().layers.map(l => `${l.type.padEnd(10)} ${l.id}`).join('\n')

// MapLibre-specific: ordered layer IDs
map.getLayersOrder()

// Find where a specific layer sits
map.getStyle().layers.findIndex(l => l.id === 'my-topo-layer')

// Count layers by type
const counts = {}
map.getStyle().layers.forEach(l => counts[l.type] = (counts[l.type] || 0) + 1)
console.table(counts)

// Find the default vector source name
[...new Set(map.getStyle().layers.map(l => l.source).filter(Boolean))]
// MapTiler styles → typically 'openmaptiles'
// Mapbox styles → typically 'composite'
```

---

## Key Differences from Mapbox GL JS

| Feature | Mapbox GL JS | MapLibre / MapTiler SDK |
|---------|-------------|------------------------|
| Default vector source | `composite` | `openmaptiles` |
| Projection syntax | `map.setProjection('globe')` | `map.setProjection({ type: 'globe' })` |
| Sky | `map.addLayer({ type: 'sky' })` | `map.setSky({...})` |
| Terrain (SDK) | Manual source + `setTerrain` | `map.enableTerrain(exag)` |
| `getLayersOrder()` | Not available | Available |
| Fog | `map.setFog({...})` | Not available (use sky config) |
| `setConfig()` | Available (Mapbox Standard) | Not available |
| Control CSS class | `.mapboxgl-ctrl-group` | `.maplibregl-ctrl-group` |
| Style URLs | `mapbox://styles/...` | String IDs or full URLs |

---

## References

- [MapTiler SDK Documentation](https://docs.maptiler.com/sdk-js/)
- [MapLibre GL JS API Reference](https://maplibre.org/maplibre-gl-js/docs/API/)
- [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/)
- [MapTiler Maps Catalog](https://www.maptiler.com/maps/)
