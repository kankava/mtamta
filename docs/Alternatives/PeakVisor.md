# PeakVisor Notes

> **Status: research notes**
>
> Public-source review completed on **March 18, 2026**. This is a product and implementation reference for later planning, not a commitment to build feature parity.

---

## Purpose

Capture what PeakVisor appears to offer publicly, what parts of its mountain-data and mapping stack are disclosed versus inferred, how much of that overlaps with mtamta's roadmap, and which ideas are worth revisiting later.

This document is intentionally conservative:

- It uses only public PeakVisor pages, credits, product pages, and public news posts
- It does **not** assume private implementation details
- It distinguishes between **confirmed**, **likely**, and **unknown**

---

## High-Level Takeaways

- PeakVisor looks much more like a **custom mountain-data and 3D terrain platform** than a generic app built around one branded map provider.
- PeakVisor publicly discloses a substantial part of its **data stack**: DEMs, imagery, and geographic names sources. That is unusually transparent compared with competitors.
- The core differentiator is not just 3D cartography. It is the combination of:
  - AR peak identification
  - offline 3D terrain
  - route planning and track analysis
  - ski touring / avalanche context
  - mountain-object richness (peaks, huts, lifts, passes, trails)
- Public materials do **not** clearly disclose whether PeakVisor uses Mapbox, MapTiler, MapLibre, or another rendering stack. The safe conclusion is: the **data infrastructure is visible**, the exact **renderer is not**.
- The strongest ideas for mtamta are:
  - avalanche bulletins as a proper map layer
  - snap-to-ski-tours route planning
  - track analytics tied tightly to 3D map context
  - mountain lifts / cable-car intelligence
  - sun/moon path planning
  - offline 3D maps
  - 3D crux inspection on routes

---

## Confirmed or Likely PeakVisor Features

### Map and data stack

- **Confirmed**: PeakVisor uses a **custom multi-source mountain-data stack**
- **Confirmed**: public credits name landscape models, satellite imagery, and geographic names data sources
- **Unknown**: exact branded renderer / basemap SDK used in app or web product

### User-facing product shape

PeakVisor presents itself as a mountain guide built around:

- **Mountain identification**
  - AR peak labeling
  - mountain encyclopedia feel
  - photo import with labeled peaks
- **3D mountain maps**
  - high-precision 3D terrain
  - trails, huts, passes, cable cars
  - offline availability
- **Planning**
  - route planner
  - GPX import
  - track analytics
  - ski-touring route snapping
- **Winter / alpine context**
  - winter mode
  - avalanche bulletins on the map
  - ski lifts and cable cars
- **Exploration / social**
  - Mountain Pulse
  - flyovers
  - object-rich browsing of peaks and regions

This is a strong product lesson: PeakVisor combines **mountain encyclopedia**, **3D planning**, and **outdoor map intelligence** into one product rather than treating them as separate tools.

---

## Public Feature / Data Notes

| Area | Public PeakVisor feature | Publicly disclosed source | Confidence | Notes |
|---|---|---|---|---|
| Terrain model stack | Multi-source DEM foundation | Credits page | Confirmed | EU-DEM, Sentinel data, ViewFinderPanoramas, USGS, ALOS World 3D, swissALTI3D |
| Geographic feature data | Peaks, huts, trails, cable cars, castles | Credits page | Confirmed | Based on OSM, GeoNames, USGN, Canadian names DB, swissNAMES3D |
| Satellite / orthophoto imagery | Regional imagery stack | Credits page | Confirmed | swissIMAGE, NAIP, BD ORTHO, PNOA, Andorra, Austria, Slovenia, etc. |
| Core mountain identification | AR peak labeling, million+ named summits | About page | Confirmed | One of the core signature features |
| 3D maps | 3D maps with trails, passes, huts | About page | Confirmed | PeakVisor claims high-precision global 3D maps |
| Offline 3D maps | downloadable offline 3D regions | About page + offline maps post | Confirmed | Download custom regions of varying size |
| Photo import / peak labels | import photos and label peaks | About page + homepage | Confirmed | Strong visual/social feature |
| Route planner | route planning and deeper track analysis | 2026 route planner post | Confirmed | Desktop-grade planning emphasis |
| Snap-to-ski-tours | snap route to ski touring lines | 2026 route planner post | Confirmed | Strong ski-touring planning feature |
| GPX import | drag-and-drop GPX import | 2026 route planner post | Confirmed | Smooth desktop planning flow |
| Track analytics | slope, elevation, pace, splits, estimates | 2026 route planner post | Confirmed | Strong analytics layer over map/route |
| Crux inspection | top steep segments with 3D inspection | 2026 route planner post | Confirmed | Very relevant for ski/alpine route reading |
| Avalanche bulletins | official bulletin regions + icons + region shading + drill-down | 2026 avalanche post | Confirmed | One of the clearest safety-oriented features |
| Mountain lifts | real-time open/closed lifts and cable cars | homepage + World Mountain Lifts posts | Confirmed | Includes winter ski lifts and summer cable cars |
| Winter mode | ski runs shown with winter-oriented palette | winter sports post | Confirmed | More than a palette toggle; includes ski-run context |
| Sun / moon path tools | sun trail and moon trail | homepage + manual snippet | Confirmed | Useful for both photo planning and terrain timing |
| 3D compass / altimeter | compass + object elevation reading | homepage | Confirmed | Part of the mountain-identification workflow |
| Mountain Pulse | see nearby user check-ins | homepage | Confirmed | Light social/discovery layer |
| Flyovers | mountain flyover videos / 3D scene exploration | homepage/news references | Partial | Clearly part of product language, but less technically described publicly |
| Exact renderer / SDK | specific web/mobile map engine | Not publicly disclosed | Unknown | Do not assume Mapbox/MapTiler without evidence |

---

## Publicly Disclosed Data Stack

PeakVisor is unusually explicit about the raw datasets it uses.

### Landscape models

Public credits list:

- `EU-DEM`
- `Copernicus Sentinel data`
- `ViewFinderPanoramas`
- `USGS` 1 arc-second and 1/3 arc-second DEMs
- `ALOS World 3D`
- `swissALTI3D`

### Geographic names / object data

Public credits list:

- `OpenStreetMap`
- `GeoNames`
- `USGN`
- `Canadian Geographical Names Database`
- `swissNAMES3D`

### Satellite / orthophoto imagery

Public credits list:

- `swissIMAGE`
- `NAIP`
- `BD ORTHO`
- `PNOA`
- regional imagery from Bolzano, Trento, Andorra, Austria, Slovenia, and others

This is the clearest evidence that PeakVisor's value is grounded in **dataset assembly and mountain-specific processing**, not just a map SDK.

---

## What Is Known vs Unknown About PeakVisor's Mapping Infrastructure

### Confirmed

- PeakVisor builds on a substantial custom terrain/data stack
- PeakVisor has its own 3D mountain models and object datasets
- PeakVisor supports offline 3D maps and web mountain exploration

### Unknown

- exact renderer on web
- exact renderer on mobile
- exact tile-serving stack
- whether they use a branded third-party map SDK under the hood

So the safe product/infrastructure summary is:

- **confirmed**: custom terrain/data platform
- **unknown**: exact rendering vendor

That is an important contrast with Slopes, where Mapbox is explicitly named.

---

## How PeakVisor Uses Maps

PeakVisor uses the map as a **3D terrain intelligence surface**.

The key user questions it helps answer are:

- what peaks am I looking at?
- what does this terrain really look like in 3D?
- how steep is this route, and where are the cruxes?
- what avalanche bulletin region does this objective sit in?
- what lifts or cable cars are open?
- how will sun, moon, and time affect this plan?

This is much closer to an **alpine planning / mountain-navigation product** than to a resort-tracking app.

The strongest product patterns are:

- `3D-first route understanding`
  - inspect steep sections directly in terrain context
- `map + profile + analytics as one workspace`
  - planner, elevation, and pace views
- `winter planning context integrated on-map`
  - ski tours, avalanche bulletins, winter mode
- `mountain object richness`
  - huts, lifts, trails, passes, peaks, and named geography

---

## What mtamta Already Plans That Overlaps Well

Your roadmap already overlaps with several PeakVisor-like foundations:

- **multiple map modes**
  - topo, satellite, terrain, seasonal overlays
- **3D terrain**
  - provider terrain support on web
- **route planning**
  - planned route builder, elevation profile, saved planned trips
- **trip system**
  - GPX import, trip routes, map detail
- **winter / hazard overlays**
  - avalanche, slope/aspect, weather, snow, lifts, webcams
- **provider-neutral overlays**
  - shared Mapbox / MapTiler app-owned layer path
- **offline / mobile direction**
  - later-phase offline maps and device/mobile work

Related project docs:

- [Architecture.md](../Architecture.md)
- [Plan.md](../Plan.md)
- [MapProviders.md](../MapProviders.md)

---

## What PeakVisor Has That mtamta Might Find Useful

These are the PeakVisor ideas that look most transferable.

### 1. Avalanche bulletins as a true map layer

This is probably the most obvious feature worth revisiting.

Why it matters:

- strong day-of safety relevance
- better than linking out to external bulletins
- fits naturally with your planned avalanche / winter overlays

Recommended direction:

- start with official bulletin region polygons / summaries
- show region color + danger icon + open full bulletin
- layer later with slope/aspect/ski route overlays

### 2. Route planner tightly coupled to analysis

PeakVisor's planner is not just "draw a line." It is:

- snap-to-ski-tours
- profile analytics
- pace / time overlays
- route sharing with planning context

That is a strong model for your future route-planning work.

### 3. 3D crux inspection

This is especially interesting for your project.

Potential mtamta parallels:

- ski route cruxes
- climbing crux sections
- steepness hotspots
- route-risk / effort highlights

### 4. Mountain lifts and cable-car intelligence

This fits well with your planned lift/webcam mountain-data direction.

Potential value:

- alpine access planning
- ski-resort and hut access context
- summer cable-car access for hiking objectives

### 5. Sun / moon path planning

This is a subtle but high-quality feature.

Useful directions for mtamta:

- photography planning
- sun/shade timing
- route exposure planning
- climb aspect / descent timing

### 6. Offline 3D maps

PeakVisor shows that offline 3D can be positioned as a serious mountain-planning capability, not just a checkbox.

That is a good benchmark for later mobile/offline work:

- downloadable custom regions
- route visibility offline
- key overlays available offline where possible

### 7. Rich object model

PeakVisor benefits from treating many mountain objects as first-class:

- peaks
- huts
- trails
- lifts
- passes
- ski tours

That is a useful reminder that map richness often comes from **object coverage**, not just better basemaps.

---

## What Seems Less Relevant for mtamta

Some PeakVisor strengths are real, but may be lower priority or more product-specific:

- AR peak identification as a near-term priority
- photo-labeling as a major standalone feature
- mountain encyclopedia depth before core trip utility matures
- broad mountain-object catalog before route/trip workflows are polished

PeakVisor is best understood as a **3D mountain guide and alpine planning platform**, not primarily a social trip journal or resort tracker.

---

## Product Direction Takeaway

PeakVisor is a strong reminder that mountain mapping value can come from:

- richer terrain understanding
- better 3D planning
- strong domain objects
- integrated hazard / timing context

Its most useful lesson for mtamta is not "copy the 3D look." It is:

- use terrain, route analytics, and mountain-object data together,
- make winter safety context visible directly on the map,
- and treat 3D as part of decision-making, not just presentation.

---

## Sources Used

- PeakVisor about page:
  - https://peakvisor.com/en/about.html
- PeakVisor credits:
  - https://peakvisor.com/en/credits.html
- Route planner / analytics:
  - https://peakvisor.com/en/news/next-gen-route-planner-track-insights.html
- Offline 3D maps:
  - https://peakvisor.com/en/news/manage-offline-3D-maps.html
- Avalanche bulletins:
  - https://peakvisor.com/en/news/avalanche-bulletins-on-the-map.html
- Winter mode / ski lifts:
  - https://peakvisor.com/en/news/skiing-and-snowboarding.html
  - https://peakvisor.com/en/news/world-mountain-lifts.html
- Homepage feature snippets:
  - https://peakvisor.com/
