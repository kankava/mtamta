# onX Backcountry Notes

> **Status: research notes**
>
> Public-source review completed on **March 16, 2026**. This is a product and implementation reference for later planning, not a commitment to build feature parity.

---

## Purpose

Capture what onX Backcountry appears to offer publicly, what data sources are disclosed or reasonably inferable, how much of that overlaps with mtamta's roadmap, and which ideas are worth revisiting later.

This document is intentionally conservative:

- It uses only public onX pages, support docs, and public Mapbox docs
- It does **not** assume private implementation details
- It distinguishes between **confirmed**, **likely**, and **unknown**

---

## High-Level Takeaways

- onX Backcountry's **web map is Mapbox-based**. Their support site explicitly references **MapBoxGL** for the web product.
- onX's value is not just basemaps. The bigger differentiator is **task-oriented overlay packaging**: Snow Mode, Trail Mode, conditions, terrain analysis, route planning, and collaborative sharing.
- Most of the interesting onX functionality appears to come from **external data + GIS processing rendered on a map**, not from Mapbox-specific outdoor data products.
- mtamta already plans much of the serious mapping foundation: topo/satellite/terrain, raster overlays, weather/wind/snow/avalanche, trip routes, route planning, elevation tools, and offline/mobile support.
- The biggest future opportunities are not "more map SDK features." They are:
  - mode-based overlay UX
  - ATES
  - recent imagery
  - trail reports / current conditions
  - SNOTEL/station overlays
  - LiDAR topo in priority regions
  - 3D peak labels
  - collaborative planning / sharing

---

## Confirmed or Likely onX Features

### Map stack

- **Confirmed**: onX Backcountry web uses **MapBoxGL**
- Evidence: support article "Web Browser does not support MapBoxGL"

### User-facing product shape

onX presents the map through a few clear use cases rather than a raw layer catalog:

- **Trail Mode**
  - hiking trails
  - wildfire layers
  - air quality
  - curated trail/adventure content
- **Snow Mode**
  - ski touring / snowshoe / XC context
  - slope angle
  - avalanche forecasts
  - ATES
  - guidebook content
- **Terrain / analysis**
  - Terrain X beta
  - slope angle, aspect, elevation-band filtering
  - viewshed
- **Planning / navigation**
  - route builder
  - waypoints, lines, shapes, tracks
  - tracker
  - compass
  - GPX export / share links
  - collaborative folders

This packaging is a strong product lesson: the overlays are grouped by **decision context**, not just by data type.

---

## Public Feature / Data Notes

| Area | Public onX feature | Publicly disclosed source | Confidence | Notes |
|---|---|---|---|---|
| Web renderer | MapBoxGL | onX support article | Confirmed | Safe to say web uses Mapbox |
| Avalanche forecasts | Daily avalanche forecast layer | US avalanche forecast centers; older blog says US + Canada coverage | Likely | Public docs do not expose a precise ingestion architecture |
| ATES | Avalanche Terrain Exposure Scale | onX blog says autoATES algorithm by John Sykes, refined with local forecasters; partnerships with A3, AIARE, AMGA | Confirmed | This is a real product differentiator |
| SNOTEL | Snowpack telemetry stations | USDA / NRCS-linked support docs | Confirmed | User taps stations and can open USDA incident info |
| Weather / forecast | Current + 7-day forecast, station-based | 2021 blog names Weather Underground; current feature page names 100,000 stations but not vendor | Partial | Current production weather vendor is not clearly disclosed publicly |
| Wind | Hourly wind speed + direction | Not clearly named in current docs | Partial | Likely tied to the same weather backend |
| Wildfire | Active and historic wildfire layers | NIFC named in onX wildfire blog | Confirmed | Good benchmark for trail-mode conditions |
| Smoke / AQI | Smoke forecast / air quality | Public docs are inconsistent; some material points to AirNow, some to NOAA | Partial | Treat exact source as unresolved |
| Recent imagery | Recent Imagery | Planet partnership publicly announced | Confirmed | Clear premium differentiator |
| Snow imagery / winter imagery | Snow Imagery basemap | Not disclosed | Unknown | Public docs mention the feature, not the source/provider |
| Trail reports | View and submit trail reports / closures | User-submitted | Confirmed | Useful model for community conditions data |
| Guidebook content | Digital guidebooks / curated routes | Beacon Guidebooks, Outdoor Project, other editorial content | Confirmed | Strong discovery + trust layer |
| Land ownership | Parcel and public/private land data | onX markets this heavily, but source stack is not detailed publicly | Partial | Very US-specific and probably lower priority for mtamta |
| LiDAR topo | LiDAR-based topo | Custom elevation tiles and dynamic hillshading per onX blog | Confirmed | Not enough detail to know exact supplier mix |
| 3D peak labels | Peak labels in 3D/offline | Not source-disclosed | Partial | Likely a curated peak dataset + label ranking |
| Offline 3D terrain | Downloadable 3D terrain | Not source-disclosed | Partial | Product confirmed, implementation not public |

---

## ATES

**ATES** = **Avalanche Terrain Exposure Scale**.

It classifies terrain by avalanche exposure and route-finding complexity, commonly:

- `Simple`
- `Challenging`
- `Complex`

Important note: ATES is **not** just slope steepness. It also reflects factors like:

- terrain traps
- connected avalanche paths
- overhead exposure
- route-finding consequences
- ability to avoid avalanche terrain

onX's public ATES material says they use an **autoATES** algorithm and then refine/localize it with avalanche forecasters.

Implication for mtamta:

- A credible ATES product is a **dataset / classification product**
- It should **not** be approximated from slope alone
- Best first path is to use official or trusted regional ATES polygon data where available

---

## How onX Uses Overlays

The most important product pattern is **mode-based overlay composition**.

They are not simply exposing twenty independent toggles. They are packaging map state around common user questions:

- `Snow Mode`: Is this tour safe? What is the terrain exposure? What is the snowpack doing?
- `Trail Mode`: Is this route open, smoky, burned, or currently a bad idea?
- `Terrain / scouting`: What terrain matches the shape, aspect, and visibility I care about?
- `Planning`: How far is it, how steep is it, and how do I share the plan?

This is probably more important than matching any single onX layer one-for-one.

---

## What Mapbox Provides vs What onX Supplies

Mapbox appears to be the **renderer and terrain engine**, not the source of onX's outdoor intelligence.

### Mapbox facilities that are relevant

Mapbox GL JS provides the rendering primitives needed to build most of these features:

- `geojson`, `vector`, `raster`, `raster-array`, `raster-dem` sources
- `symbol`, `circle`, `line`, `fill`, `raster`, `hillshade`, `fill-extrusion`, `raster-particle` layers
- runtime source/layer management
- custom WebGL layers for more advanced analysis
- terrain rendering via `raster-dem`
- elevation sampling via `queryTerrainElevation()`

### Typical mapping from feature to rendering approach

| Feature type | Likely rendering path |
|---|---|
| Avalanche zones / ATES polygons | GeoJSON or vector tiles + `fill` / `line` layers |
| SNOTEL / weather stations | GeoJSON points + `symbol` / `circle` layers |
| Wildfire / closures / incidents | GeoJSON points / polygons + popups |
| Recent imagery / snow imagery / snow cover | `raster` or WMS/XYZ imagery overlay |
| Wind fields | point arrows first, later `raster-array` + `raster-particle` |
| Slope / aspect / hillshade / terrain filters | DEM processing + `hillshade`, `raster`, or custom WebGL |
| Viewshed | backend raster generation or custom WebGL terrain analysis |
| Peak labels | `symbol` layer over a curated peaks dataset |

So the practical model is:

- **Mapbox renders**
- **External data providers supply the domain data**
- **The app / backend owns the GIS processing and product logic**

This same pattern would also work with MapTiler for many layers.

---

## What mtamta Already Plans That Overlaps Well

The current roadmap already covers a lot of the serious map infrastructure that an onX-like product needs.

### Strong overlap already planned

- **Multiple base map modes**
  - topo, satellite, country topo, seasonal imagery
- **3D terrain**
  - provider DEM support
- **Raster terrain overlays**
  - slope, aspect, avalanche slope filter, sun/shade, steep/flat
- **Trip system**
  - GPX upload, trip routes, photos, trip detail
- **Map search**
  - geocoder in Phase 4
- **Live mountain data**
  - weather, wind, snow depth, avalanche, lifts, webcams
- **Route planning**
  - waypoints, snapped route, elevation profile, save as planned trip
- **Offline and mobile direction**
  - offline maps, GPS recording
- **Climbing-specific structure**
  - segments, pitches, OpenBeta-oriented future

Related project docs:

- [Architecture.md](../Architecture.md)
- [Plan.md](../Plan.md)
- [MapProviders.md](../MapProviders.md)

### Particularly strong foundations vs onX-style needs

- country-specific topo maps for priority regions
- dual Mapbox / MapTiler direction
- custom terrain-analysis overlays
- trip routes as first-class user content
- provider-neutral overlay architecture direction

---

## Ideas Worth Revisiting Later

These are the features most likely to add real product value beyond the existing roadmap.

### 1. Overlay bundles / activity modes

Probably the highest-leverage UX change.

Suggested bundles:

- `Snow`
  - slope angle
  - aspect
  - avalanche danger
  - snow depth
  - ski touring overlays
  - winter / recent imagery
- `Trail`
  - wildfire
  - smoke / AQI
  - trail reports
  - weather
- `Terrain`
  - topo
  - hillshade
  - custom terrain filters
  - viewshed later
- `Planning`
  - route builder
  - distance tool
  - elevation profile
  - saved routes / trip overlays

### 2. ATES

High-value snow safety feature if mtamta wants a strong ski / avalanche identity.

Recommended approach:

- use trusted ATES polygon datasets where available
- avoid pretending slope-only analysis is ATES
- keep ATES explicitly paired with avalanche forecast context

### 3. SNOTEL and mountain stations

Very useful for snow users and relatively understandable in-product.

Useful shape:

- station markers
- recent snow / SWE / temp / wind summary
- favorite stations
- region-specific station types later

### 4. Recent imagery

This may be more valuable than static summer/winter composites for actual trip planning.

Recommended product shape:

- keep global/low-cost seasonal imagery as baseline
- add "recent imagery" only for priority regions when budget justifies it
- make freshness visible in the UI

### 5. Trail reports / route conditions

Strong community and retention feature.

Potential directions:

- user-submitted conditions
- closures
- moderation / trust signals
- tie reports to trips, routes, or map features

### 6. Viewshed

Natural extension of the terrain-analysis direction.

Potential uses:

- line-of-sight for route planning
- summit visibility / photography planning
- snow line / approach scouting

### 7. LiDAR topo in priority regions

This fits mtamta better than a global rollout.

Likely good targets:

- Alps
- North America
- Scandinavia priority regions

Use case:

- premium topo clarity
- better contour detail
- better hillshade / micro-terrain reading

### 8. 3D peak labels

Good medium-effort feature with high perceived quality.

Likely needs:

- peaks dataset
- label ranking / decluttering
- 3D-aware styling rules

### 9. Collaborative planning

onX is stronger than a pure solo-GPX workflow here.

Interesting additions:

- share links for routes / trips / folders
- collaborative collections
- map comments or notes on shared plans

### 10. Curated route / guide content

If mtamta wants stronger discovery, editorial or partner content matters.

Examples:

- curated ski tours
- approach notes
- seasonal hazard notes
- climb approach / descent details

---

## Lower-Priority or Less Relevant Ideas

These look less important for mtamta right now:

- **US land ownership / parcel data**
  - very strong for onX
  - less central to the current Alps + North America + Scandinavia direction
- **broad property-boundary product expansion**
  - likely large cost / licensing footprint
  - not a clear near-term fit for the mountain-use focus

---

## Open Questions for Later

- Is there a credible source strategy for ATES outside onX's current US-focused coverage?
- Should "recent imagery" become a premium-only feature?
- Does mtamta want condition reports to be:
  - fully user-generated
  - curated / moderated
  - or tied to trusted external feeds only?
- Is LiDAR topo better shipped as:
  - a premium regional basemap
  - or a backend-derived enhancement to the default topo stack?
- Do collaborative route folders matter more than social feed features for early retention?

---

## Sources

### onX

- Features page: <https://www.onxmaps.com/backcountry/app/features>
- Main Backcountry product page: <https://www.onxmaps.com/backcountry/>
- Route Builder: <https://www.onxmaps.com/backcountry/app/features/route-builder>
- MapBoxGL support article: <https://onxbackcountry.zendesk.com/hc/en-us/articles/18085985219341-Web-Browser-does-not-support-MapBoxGL>
- Basemaps / Snow Imagery / Recent Imagery / 3D mode: <https://onxbackcountry.zendesk.com/hc/en-us/articles/360052208591-Using-Basemaps-Map-Layers-and-3D-Mode-in-onX-Backcountry>
- SNOTEL support article: <https://onxbackcountry.zendesk.com/hc/en-us/articles/4422938191757-Viewing-SNOTELs-and-Incident-Reports>
- Weather blog, May 5 2021: <https://www.onxmaps.com/backcountry/blog/real-time-weather-info-and-forecasts>
- ATES launch: <https://www.onxmaps.com/blog/onx-backcountry-launches-avalanche-terrain-exposure-scale>
- Winter tools update, Dec 17 2024: <https://www.onxmaps.com/blog/onx-backcountry-expands-winter-tools-and-content-coverage>
- LiDAR topo / 3D peak labels / offline 3D terrain, Aug 20 2025: <https://www.onxmaps.com/blog/onx-backcountry-adds-lidar-based-topo>
- Planet recent imagery partnership: <https://www.onxmaps.com/blog/onx-leverages-planet-data-to-launch-new-recent-imagery-feature>
- Wildfire layer / NIFC: <https://www.onxmaps.com/backcountry/blog/wildfire-map-layer>
- Trail reports: <https://www.onxmaps.com/backcountry/app/features/trail-report>

### Mapbox

- GL JS style layers guide: <https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/style-layers/>
- Style spec sources: <https://docs.mapbox.com/style-spec/reference/sources/>
- Style spec layers: <https://docs.mapbox.com/style-spec/reference/layers/>
- CustomLayerInterface / custom layers: <https://docs.mapbox.com/mapbox-gl-js/api/properties/>
- Terrain example: <https://docs.mapbox.com/mapbox-gl-js/example/add-terrain/>
- Terrain elevation query: <https://docs.mapbox.com/mapbox-gl-js/example/query-terrain-elevation/>
- Rain example: <https://docs.mapbox.com/mapbox-gl-js/example/rain/>
- Snow example: <https://docs.mapbox.com/mapbox-gl-js/example/snow/>

