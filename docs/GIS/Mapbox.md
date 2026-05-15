# Mapbox GL JS — Layer & Style API Reference

> Quick reference for layer manipulation, style control, and rendering APIs relevant to our use cases. Based on Mapbox GL JS v2/v3.
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
// → { id: 'road-primary', type: 'line', source: 'composite', ... } | undefined
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
// Hide a layer (keeps it in the style, just not rendered)
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

// Change icon image
map.setLayoutProperty('poi-label', 'icon-image', 'marker')

// Any layout property from the style spec can be set
map.setLayoutProperty(layerId, property, value)
map.getLayoutProperty(layerId, property)
```

### Filters

```js
// Set a filter on a layer (only render features matching the filter)
map.setFilter('road-primary', ['==', 'class', 'motorway'])

// Remove filter (show all features)
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

```js
// Enable terrain
map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })

// Disable terrain
map.setTerrain(null)

// Terrain DEM source
map.addSource('mapbox-dem', {
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14,
})
```

### Sky / Fog / Light

```js
// Sky layer (for 3D terrain)
map.addLayer({
  id: 'sky',
  type: 'sky',
  paint: {
    'sky-type': 'atmosphere',
    'sky-atmosphere-sun': [0, 0],
    'sky-atmosphere-sun-intensity': 15,
  },
})

// Fog (depth-based atmosphere)
map.setFog({
  range: [0.5, 10],
  color: 'white',
  'high-color': '#add8e6',
  'horizon-blend': 0.1,
  'space-color': '#d8f2ff',
  'star-intensity': 0.0,
})

// Light
map.setLight({
  anchor: 'viewport',
  color: 'white',
  intensity: 0.4,
})
```

---

## Projection

```js
// Globe view
map.setProjection('globe')

// Standard flat map
map.setProjection('mercator')

// Other options: 'albers', 'equalEarth', 'equirectangular',
//   'lambertConformalConic', 'naturalEarth', 'winkelTripel'
```

---

## Style Switching

```js
// Full style swap
map.setStyle('mapbox://styles/mapbox/outdoors-v12')

// With options
map.setStyle(styleUrl, { diff: false }) // force full reload (no diffing)

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

## Useful for Topo Overlay Work

### Problem: Base Map Layers Bleeding Through Topo Overlay

When a raster topo overlay is inserted before the first symbol layer, some base map features (road casings, trail lines) may still render above the overlay because they're interleaved with symbol layers.

### Option 1: Hide Base Map Layers Under Topo

```js
// Find all fill and line layers from the base style
const baseLayers = map.getStyle().layers.filter(l =>
  (l.type === 'fill' || l.type === 'line') &&
  l.source === 'composite' // Mapbox's default source name
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
// Insert topo raster above ALL base layers (fills + lines + symbols)
// Only keep labels we explicitly want above the overlay
const lastSymbolLayer = map.getStyle().layers
  .filter(l => l.type === 'symbol')
  .pop()

map.moveLayer('topo-raster', lastSymbolLayer?.id)
```

### Option 3: Reduce Opacity of Conflicting Layers

```js
// Make base map lines semi-transparent when topo is active
const lineLayerIds = map.getStyle().layers
  .filter(l => l.type === 'line' && l.source === 'composite')
  .map(l => l.id)

for (const id of lineLayerIds) {
  map.setPaintProperty(id, 'line-opacity', 0.2)
}
```

### Option 4: Filter Base Layers by Zoom

```js
// Only show base map roads at high zoom where topo tiles may be missing detail
map.setLayerZoomRange('road-primary', 16, 22)
```

### Diagnostic: Inspect Layer Stack in Console

```js
// Run in browser console to see the full layer stack with types
map.getStyle().layers.map(l => `${l.type.padEnd(10)} ${l.id}`).join('\n')

// Find where a specific layer sits
map.getStyle().layers.findIndex(l => l.id === 'my-topo-layer')

// Count layers by type
const counts = {}
map.getStyle().layers.forEach(l => counts[l.type] = (counts[l.type] || 0) + 1)
console.table(counts)
```

---

## References

- [Mapbox GL JS API Reference](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Mapbox Style Specification](https://docs.mapbox.com/style-spec/)
- [Mapbox GL JS Examples](https://docs.mapbox.com/mapbox-gl-js/example/)
