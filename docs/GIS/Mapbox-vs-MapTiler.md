# Mapbox vs MapTiler for mtamta

> **Status: research notes**
>
> Public-source comparison completed on **March 16, 2026**. This document evaluates feature parity against mtamta's roadmap, not a generic vendor comparison.

---

## Purpose

Assess how well **Mapbox** and **MapTiler** fit mtamta's planned map stack:

- what each provider gives you directly
- what remains provider-neutral and app-owned
- where one provider is clearly ahead
- which roadmap phases are naturally better matched to one provider or the other

This should be read alongside:

- [Architecture.md](Architecture.md)
- [Plan.md](Plan.md)
- [MapProviders.md](MapProviders.md)

---

## Short Summary

- **MapTiler is stronger out of the box for outdoor presentation**:
  - ready-made `OUTDOOR`
  - ready-made `WINTER`
  - ready-made `Satellite Hybrid`
  - first-party weather module
  - first-party elevation profile control
- **Mapbox is stronger as a broader application platform**:
  - more mature interactive search stack
  - clearly documented Directions API
  - stronger mobile/offline documentation and product surface
  - lower-level rendering primitives for custom animated weather and analysis
- **Most of mtamta's most important overlays are provider-neutral anyway**:
  - trip routes
  - country topo overlays
  - seasonal satellite overlays
  - avalanche polygons
  - weather markers from your own backend
  - webcams, lifts, custom GeoJSON, WMS/XYZ overlays

So the practical split is:

- use **shared overlays** for your real product logic
- treat **basemap style**, **geocoder**, **weather module**, and **directions** as the main provider-specific differences

---

## Roadmap Lens

Relevant roadmap areas:

- **Phase 3.5**: dual-provider runtime and shared overlay system
- **Phase 4**: trip routes + Mapbox-first search
- **Phase 8**: live data layers (weather, wind, snow, avalanche, lifts, webcams)
- **Phase 11**: route planning, elevation tools, offline/mobile-heavy features

The biggest differences between Mapbox and MapTiler matter in:

- base style quality and readiness
- search
- weather
- directions
- elevation tooling
- offline/mobile direction

---

## Feature Parity Matrix

| Capability | Mapbox | MapTiler | Best read for mtamta |
|---|---|---|---|
| Outdoor basemap | Yes: `outdoors-v12` | Yes: `Outdoor` | Both work |
| Outdoor style maintenance | Outdoor is in legacy/classic style bucket | Outdoor is a current flagship outdoor style | Advantage MapTiler |
| Satellite basemap | Yes | Yes | Parity |
| Hybrid satellite basemap | Yes: `Satellite Streets`, `Standard Satellite` | Yes: `Satellite Hybrid` | Parity |
| Winter / snow basemap | No official ready-made winter outdoor basemap found | Yes: ready-made `Winter` style | Advantage MapTiler |
| Ski / winter cartography | Partial via Outdoors/custom style | Strong in Winter style | Advantage MapTiler |
| 3D terrain | Yes | Yes | Parity |
| Globe projection | Yes | Yes | Parity |
| Custom GeoJSON layers | Yes | Yes | Parity |
| Raster / WMS / XYZ overlays | Yes | Yes | Parity |
| Search UI | Strong Search Box API + SDKs | Geocoding API + geocoding control | Advantage Mapbox |
| Directions / route planning | Strong official Directions API | No equivalent first-party routing docs verified in this research | Advantage Mapbox |
| Weather as turnkey map feature | No comparable first-party web weather module found | First-party Weather JS module | Advantage MapTiler |
| Custom weather visualization primitives | Strong (`raster-array`, `raster-particle`, rain/snow style effects) | Good, but more weather-module-oriented | Advantage Mapbox for custom engineering |
| Elevation profile tooling | DIY via terrain + app code | First-party elevation profile control | Advantage MapTiler |
| Mobile/offline stack | Strong and well documented | Public parity not verified in this research | Advantage Mapbox |
| On-prem / self-host story | Exists, but not central to your current plan | Very explicit public cloud + on-prem story | Advantage MapTiler if self-hosting matters later |

---

## Basemaps and Style Readiness

### MapTiler

MapTiler is clearly more opinionated for outdoor products:

- **Outdoor** is a dedicated hiking/biking/outdoor style with routes, POIs, terrain, and contours
- **Winter** is a dedicated winter sports style with ski runs, lifts, trails, and avalanche-zone-oriented winter cartography
- **Satellite Hybrid** is a first-class ready-made style

This is valuable because it reduces the amount of style work you need to do before the map feels product-specific.

### Mapbox

Mapbox definitely covers the basics:

- `mapbox://styles/mapbox/outdoors-v12`
- `mapbox://styles/mapbox/satellite-streets-v12`
- `Mapbox Standard Satellite`

But there are two caveats:

- Mapbox's classic styles page says **Outdoors v12 is no longer actively maintained**
- I did **not** find a current official ready-made winter outdoor style comparable to MapTiler Winter

For mtamta, that means:

- Mapbox can absolutely support the product
- but your current plan to create **custom Summer/Winter styles** is the right one
- MapTiler reduces that styling burden immediately

### Practical conclusion

- If your priority is **get a strong outdoor/winter visual identity fast**, MapTiler is ahead
- If your priority is **full app platform capability**, Mapbox is ahead

---

## What "Winter" Really Means

Important distinction:

- **MapTiler Winter** is a **basemap/style**
- it is **not** live snowpack truth
- it does **not** replace real weather, avalanche, or snow-depth feeds

It gives you:

- ski/winter symbology
- winter-oriented color palette
- useful winter-specific context

It does **not** give you:

- real avalanche danger
- current snow conditions
- recent imagery
- forecast data

So for mtamta:

- Winter style is a **presentation advantage**
- not a replacement for your planned live data layers

---

## Shared Features That Should Stay Provider-Neutral

Most of your most valuable map features should remain shared regardless of provider:

- trip routes from `/api/v1/map/trips`
- country topo overlays
- Sentinel / seasonal imagery
- avalanche forecast polygons
- ski, hiking, climbing overlays
- webcams
- lift status
- Open-Meteo-driven weather markers
- custom slope/aspect/terrain filters

These are exactly the right candidates for the shared `AppMapAdapter` path in [MapProviders.md](MapProviders.md).

This matters because it means:

- your real product value is **not locked to either vendor**
- the providers mainly differ in **basemap UX** and **certain first-party modules**

---

## Search

### Mapbox

Mapbox is stronger here today.

Publicly verified:

- Search Box API for interactive search
- Search JS libraries for web/React
- autocomplete-oriented interactive search flow
- strong POI/address/category/place support

This aligns directly with your current Phase 4 plan.

### MapTiler

MapTiler does have:

- Geocoding API
- geocoding control module
- framework integration docs

That means MapTiler search is viable, but the overall public product surface appears less mature than Mapbox's search stack.

### Practical conclusion

- **Phase 4 geocoder** should stay **Mapbox-first**
- **MapTiler geocoder** is realistic later
- this matches your current roadmap and is still the right call

---

## Weather

### MapTiler

This is where MapTiler is most differentiated.

Publicly documented:

- first-party **Weather JS module**
- temperature, wind, precipitation, pressure, radar
- animated time playback
- weather-specific layers and controls
- direct map integration through the MapTiler SDK

If you want weather as a **native visual map feature**, MapTiler is ahead.

### Mapbox

I did **not** find a comparable first-party Mapbox weather module/product for web map integration.

But Mapbox gives you strong low-level primitives:

- `raster-array`
- `raster-particle`
- animated wind example
- `rain` and `snow` style effects
- custom layer APIs

That means Mapbox is very capable if **you** provide the weather data and build the visualization logic.

### Practical conclusion for mtamta

Two different paths:

1. **Provider-neutral weather**
- keep using your own backend + Open-Meteo
- render markers/arrows/rasters yourself
- works in both Mapbox and MapTiler

2. **MapTiler-native weather**
- use MapTiler's weather module inside the MapTiler runtime
- faster path to animated weather UX
- but less provider-neutral

Given your roadmap, the cleanest interpretation is:

- initial Phase 8 weather should stay **provider-neutral**
- later, if weather becomes a standout product pillar, MapTiler gets a clear feature advantage

---

## Directions and Route Planning

### Mapbox

Mapbox is clearly stronger here for your current plans.

Publicly documented:

- Directions API
- `walking`, `cycling`, `driving`, `driving-traffic`
- up to 25 coordinates
- good fit for your waypoint-based planner

This maps directly onto your planned route planner in [Architecture.md](Architecture.md) and [Plan.md](Plan.md).

### MapTiler

I did **not** verify a first-party routing / directions product from current public MapTiler docs during this research.

That does **not** prove it doesn't exist in some form.
It does mean:

- it is not something I would treat as roadmap-ready without additional validation
- your current `coming_soon` stance is correct

### Practical conclusion

- **Mapbox should own route planning first**
- **MapTiler route planning should remain disabled / coming soon**
- if you later want parity, you likely need either:
  - a separate routing provider
  - or fresh verification that MapTiler has a credible routing stack

---

## Elevation and Terrain Tools

### Terrain

Both providers support:

- 3D terrain
- DEM-backed terrain rendering
- outdoor-appropriate basemaps

So your Phase 3.5 terrain parity goal is realistic.

### Elevation tools

MapTiler has more turnkey elevation UX:

- Elevation API
- Elevation Profile control for GeoJSON traces

Mapbox is more DIY:

- `queryTerrainElevation()`
- terrain examples
- enough primitives to build custom profiles and terrain-derived tools

### Practical conclusion

- for **quick elevation profile UI**, MapTiler is ahead
- for **custom terrain analysis**, both are viable
- your slope/aspect/terrain-filter overlays remain mostly app-owned regardless

---

## Weather-like Visual Effects vs Real Data

Mapbox now supports:

- animated **snow**
- animated **rain**
- animated **wind particles**

These are useful, but they are easy to misread.

They are best treated as:

- visual atmosphere
- presentation enhancements
- or custom data-visualization hooks

They are **not** equivalent to a full weather product by themselves.

MapTiler's weather stack is closer to a real packaged weather feature.

---

## Mobile / Offline Direction

For your future mobile-heavy roadmap, Mapbox appears ahead.

Publicly verified:

- offline maps for Android/iOS
- offline search
- offline routing / navigation tile storage
- clearer end-to-end mobile/offline docs

For MapTiler, I did not verify comparable public mobile/offline documentation in this research strong enough to treat it as parity.

Practical consequence:

- for **web-only Phase 3.5/4**, this does not matter much
- for **Phase 11 and beyond**, this matters a lot

If offline/mobile becomes a major differentiator, Mapbox retains a structural advantage unless you later validate a stronger MapTiler mobile/offline stack.

---

## What This Means by Roadmap Phase

### Phase 3.5

Both providers are good enough for:

- topographic basemap
- satellite / hybrid basemap
- 3D terrain
- shared overlays
- trip layers

MapTiler gives you a faster path to polished outdoor/winter presentation.

### Phase 4

Best split:

- shared trip layers in both providers
- **Mapbox geocoder first**
- MapTiler geocoder later

This already matches your plan.

### Phase 8

Best split:

- keep live data provider-neutral first
- use Open-Meteo / avalanche feeds / lift data / webcams through your own backend
- optionally give MapTiler a richer native weather experience later

### Phase 11

Best split:

- **Mapbox-first** for route planning, offline/mobile-heavy features
- MapTiler stays behind capability gating unless or until routing/mobile parity is validated

---

## Recommended Product Positioning

### If user chooses Mapbox

Expose it as:

- stronger search
- stronger route planning
- stronger future mobile/offline path
- more custom-engineering headroom

### If user chooses MapTiler

Expose it as:

- stronger outdoor basemap aesthetics
- built-in winter map
- built-in hybrid map
- stronger first-party weather path
- stronger turnkey elevation profile path

This gives each stack a believable identity rather than pretending they are identical.

---

## Recommended Internal Rules

### Keep shared

- trip layers
- raster overlays
- weather markers from your own backend
- avalanche polygons
- webcams / lifts / GeoJSON layers
- country topo overlays
- Sentinel imagery

### Keep provider-specific

- basemap style resolution
- terrain source wiring
- geocoder UI
- weather modules
- directions / route planner
- elevation profile controls

### Gate as `coming_soon`

- MapTiler directions
- MapTiler-equivalent route planner until validated
- MapTiler parity for custom summer/winter modes if you do not use built-in Winter directly

---

## Current Best Recommendation

For mtamta's current plan:

- **Mapbox** should be treated as the stronger **application platform**
- **MapTiler** should be treated as the stronger **outdoor-first basemap and weather-enhanced option**

That means your current architecture choice is correct:

- dual-provider runtime
- shared overlays
- provider capability gating
- Mapbox-first search and directions
- MapTiler-first winter/weather differentiation

If you had to simplify it to one sentence:

- **MapTiler gives you better outdoor map defaults; Mapbox gives you better full-stack product infrastructure.**

---

## Sources

### Project docs

- [Architecture.md](Architecture.md)
- [Plan.md](Plan.md)
- [MapProviders.md](MapProviders.md)

### Mapbox

- Styles API: <https://docs.mapbox.com/api/maps/styles/>
- Mapbox Standard style API: <https://docs.mapbox.com/map-styles/standard/api/>
- Search Box API: <https://docs.mapbox.com/api/search/search-box/>
- Directions API: <https://docs.mapbox.com/api/navigation/directions/>
- Query terrain elevation example: <https://docs.mapbox.com/mapbox-gl-js/example/query-terrain-elevation/>
- Wind particle example: <https://docs.mapbox.com/mapbox-gl-js/example/raster-particle-layer/>
- Snow effect example: <https://docs.mapbox.com/mapbox-gl-js/example/snow/>
- Snow style-spec reference: <https://docs.mapbox.com/style-spec/reference/snow/>
- Layers spec: <https://docs.mapbox.com/style-spec/reference/layers/>
- Offline maps overview: <https://docs.mapbox.com/help/troubleshooting/mobile-offline/>
- Android offline navigation: <https://docs.mapbox.com/android/navigation/v2/guides/advanced/offline/>

### MapTiler

- SDK JS: <https://docs.maptiler.com/sdk-js/>
- Map styles: <https://docs.maptiler.com/sdk-js/api/map-styles/>
- Outdoor: <https://www.maptiler.com/maps/outdoor/>
- Winter: <https://www.maptiler.com/maps/winter/>
- Satellite / Hybrid: <https://www.maptiler.com/maps/satellite/>
- Outdoor topo / style family: <https://www.maptiler.com/maps/outdoor-topo/>
- Weather JS module: <https://docs.maptiler.com/sdk-js/modules/weather/>
- Weather layer example: <https://docs.maptiler.com/sdk-js/examples/weather-layer-switcher/>
- Geocoding control: <https://docs.maptiler.com/sdk-js/modules/geocoding/>
- Search / geocoding API: <https://docs.maptiler.com/cloud/api/geocoding/>
- Elevation profile control: <https://docs.maptiler.com/sdk-js/modules/elevation-profile/>
- Elevation API: <https://docs.maptiler.com/cloud/api/elevation/>
- Maps API: <https://docs.maptiler.com/cloud/api/maps/>
- Cloud API index: <https://docs.maptiler.com/cloud/api/>

