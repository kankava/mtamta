# Slopes Notes

> **Status: research notes**
>
> Public-source review completed on **March 18, 2026**. This is a product and implementation reference for later planning, not a commitment to build feature parity.

---

## Purpose

Capture what Slopes appears to offer publicly, what parts of its mapping stack are disclosed versus inferred, how much of that overlaps with mtamta's roadmap, and which ideas are worth revisiting later.

This document is intentionally conservative:

- It uses only public Slopes pages, changelogs, blog posts, and newsroom materials
- It does **not** assume private implementation details
- It distinguishes between **confirmed**, **likely**, and **unknown**

---

## High-Level Takeaways

- Slopes' **premium interactive maps use Mapbox**. Their privacy policy explicitly names **MapBox** as the premium map provider.
- Slopes is much more **resort / in-bounds / activity-tracking focused** than onX or PeakVisor. The core value is not broad mountain intelligence; it is **resort navigation + live recording + stats + social context**.
- Slopes has built a meaningful amount of **custom resort map data**. Public materials say the app now combines **proprietary Slopes maps** with **OpenStreetMap-sourced resort maps**.
- The mapping workflow appears to be **custom GIS production over aerial / satellite imagery**, with official resort references and anonymized user heatmaps used to improve accuracy.
- The strongest ideas for mtamta are not necessarily "copy Slopes maps." They are:
  - live lift / trail status
  - resort POI / lift / trail search
  - timeline-synced map replays
  - speed heatmaps
  - offline interactive resort maps
  - friend location / presence on the map
  - strong privacy defaults for location data

---

## Confirmed or Likely Slopes Features

### Map stack

- **Confirmed**: Slopes Premium uses **MapBox**
- Evidence: privacy policy says "My premium map provider, MapBox..."

### Fallback / free maps

- **Confirmed on iPhone**: free users can see core recording maps via **Apple Maps** instead of the premium winter maps
- **Likely more generally**: free mode uses standard device maps for basic visualization; a 2024 newsroom post says free features rely on "standard device maps for data visualization"
- Public materials do **not** clearly document the Android fallback map provider

### User-facing product shape

Slopes packages the map around a few clear resort-time use cases:

- **Recording / navigation**
  - live location while skiing or snowboarding
  - friend locations on the mountain
  - trail / lift / facility / ski patrol search
  - premium interactive maps in 2D and 3D
- **Replay / performance**
  - run-by-run stats
  - timeline-synced replay
  - speed heatmaps
  - compare runs side-by-side
  - Apple Watch-driven fitness insights
- **Resort operations / current state**
  - resort conditions
  - live lift status
  - live trail status
- **Preparedness**
  - offline interactive maps
  - offline paper trail maps

This is a strong product lesson: Slopes uses the map as the center of the **day-of activity experience**, not primarily as a discovery or hazard-analysis surface.

---

## Public Feature / Data Notes

| Area | Public Slopes feature | Publicly disclosed source | Confidence | Notes |
|---|---|---|---|---|
| Premium renderer | Premium winter maps | MapBox named in privacy policy | Confirmed | Safe to say premium interactive maps use Mapbox |
| Free / fallback maps | Apple Maps on iPhone free mode; standard device maps in free mode | iOS changelog + 2024 newsroom post | Confirmed / partial | Android fallback not clearly named publicly |
| Resort map coverage | 2,000+ supported resorts | Slopes newsroom | Confirmed | Slopes positions this as one of the largest 3D ski-map collections |
| Proprietary resort maps | 662 proprietary maps | 2024 maps expansion post | Confirmed | Indicates real in-house mapping effort |
| OSM resort maps | 1,523 OSM-sourced maps | 2024 maps expansion post | Confirmed | Useful benchmark for combining custom + community data |
| Map authoring workflow | GIS over imagery + official resort references + Skiresorts.info + anonymized heatmaps | Slopes mapping blog | Confirmed | ArcGIS screenshot shown publicly |
| Resort search | Search for trails, lifts, facilities, ski patrol | 2024 newsroom + 2023 feature post | Confirmed | Strong on-mountain usability feature |
| High-definition resort layers | Ropes, gates, slow zones, restricted areas, POIs | 2024 maps expansion post | Confirmed | More operational/detail-oriented than generic ski maps |
| 3D mode | Interactive 3D resort maps | Premium page + newsroom | Confirmed | Available on iOS and Android |
| Virtual 3D replay | Replay your runs on a virtual 3D mountain | Premium page | Confirmed | A distinct feature beyond plain map playback |
| Offline maps | Offline copies of interactive + paper maps | Premium page | Confirmed | Strong mobile value |
| Speed heatmaps | Map/timeline-linked speed visualization | Premium page | Confirmed | Valuable replay UX idea |
| Live lift status | Live operational status on maps | Slopes blog | Confirmed | Available to all users at supported resorts |
| Live trail status | Trail closure / open state on maps | Slopes blog | Confirmed | Premium-gated in published materials |
| Fitness / effort insights | Heart-rate / effort views with Apple Watch | Premium page + newsroom | Confirmed | Strong activity-tracking angle, less central to mtamta map roadmap |
| Live friend location | See where friends are while recording | newsroom + privacy policy | Confirmed | Shared only under explicit location-sharing flows |
| Privacy / data posture | GPS local-first if no account, limited live-location retention | privacy policy | Confirmed | Good product benchmark |
| Backend / storage | DigitalOcean, AWS, and own servers | privacy policy | Confirmed | General app infra, not map-specific |
| Exact Android free map provider | Fallback non-premium map stack on Android | Not disclosed | Unknown | Do not assume Apple/Google equivalence publicly |
| Exact Mapbox products used | GL JS vs SDK family / tilesets / styles | Not disclosed in detail | Partial | We only know MapBox is the premium provider |

---

## How Slopes Uses Maps

Slopes treats the map as the UI for a **day on the mountain**:

- where am I?
- what trail or lift is this?
- where are my friends?
- what did my runs actually look like?
- which lifts or trails are currently open?
- where did I hit top speed?

That is different from onX-style layering. Slopes is less about environmental overlays and more about **session playback + resort wayfinding + live resort state**.

The most interesting product patterns are:

- `timeline-synced replay`
  - map motion coordinated with runs/lifts/stat breakdowns
- `operational map search`
  - lifts, trails, bathrooms, ski patrol, facilities
- `status-aware map`
  - closed trails faded out, live lift/trail state integrated into search cards
- `resort-specific detail layers`
  - ropes, gates, slow zones, restricted areas

---

## What Mapbox Provides vs What Slopes Supplies

Mapbox appears to be the **premium renderer / map platform**, but Slopes' differentiated value clearly comes from **custom resort data and product workflow**, not from Mapbox alone.

### What Mapbox likely contributes

- premium base map rendering
- interactive map camera / 3D controls
- overlay rendering for trails, lifts, POIs, status, and replay tracks
- the map surface for live navigation, search, and friend-location display

### What Slopes itself appears to supply

- custom resort geometries and metadata
- merged map coverage from proprietary data + OSM
- operational resort layers
- status integration
- replay logic and speed heatmap UX
- location-sharing and privacy flows
- activity parsing (lifts vs runs vs uphill)

So the practical model is:

- **Mapbox renders**
- **Slopes owns the resort intelligence**
- **Slopes' backend / GIS pipeline creates the real differentiation**

---

## What mtamta Already Plans That Overlaps Well

The current roadmap already overlaps with several Slopes-like foundations:

- **multiple base map modes**
  - topo, satellite, country topo, seasonal imagery
- **3D terrain**
  - provider terrain support on web
- **trip system**
  - GPX import, routes on map, trip detail, photos
- **route and map replay potential**
  - trip routes, elevation profile, saved planned routes
- **provider-neutral overlay architecture**
  - dual Mapbox / MapTiler direction with shared app-owned layers
- **live mountain data**
  - weather, wind, avalanche, lifts, webcams already planned
- **offline / mobile direction**
  - later-phase offline maps and device integration

Related project docs:

- [Architecture.md](Architecture.md)
- [Plan.md](Plan.md)
- [MapProviders.md](MapProviders.md)

---

## What Slopes Has That mtamta Might Find Useful

These are the Slopes ideas that look most transferable.

### 1. Live lift / trail status on the map

Probably the clearest feature worth borrowing for resort-heavy use.

Why it matters:

- immediate day-of usefulness
- complements your planned lift / webcam / condition work
- fits naturally into map search and resort detail views

Recommended direction:

- start with lift status first
- trail status second
- integrate status into both map styling and search results

### 2. Resort POI and operational search

Slopes is strong at helping users answer practical resort questions:

- which lift is this?
- where is ski patrol?
- where is food / restroom / base area?

This is especially relevant if mtamta keeps a ski-resort use case alongside broader mountain trips.

### 3. Timeline-synced replay

The map synced to stats and replay is one of Slopes' strongest product patterns.

Useful directions for mtamta:

- trip replay with route progress + elevation + photos
- climb / ski segment replay
- weather / condition annotations during replay later

### 4. Speed heatmaps / activity heat overlays

This is a strong bridge between mapping and performance analytics.

For mtamta, this could evolve into:

- ski speed heatmaps
- climb pacing / crux heatmaps
- route effort overlays

### 5. Offline interactive maps

Slopes treats offline maps as a premium readiness feature, not just a technical checkbox.

That is a useful benchmark for mtamta's later offline/mobile work:

- interactive offline map
- route visibility offline
- important overlays selectively cached offline

### 6. Privacy-conscious location sharing

Slopes has a strong public privacy story:

- local-first if no account
- location sharing off by default
- limited retention for shared live location

That is worth revisiting when mtamta gets to:

- friend location
- group outings
- live tracking / shared trips

---

## What Seems Less Relevant for mtamta

Some Slopes strengths are real, but they may be lower priority for this project:

- deep Apple Watch / workout-ring / fitness integration
- highly resort-specific operational layers before broader trip utility is mature
- run-vs-lift parsing if the product stays wider than resort skiing
- family plan / consumer subscription packaging lessons

Slopes is best understood as a **polished ski-resort activity product**, not as a broad mountain intelligence platform.

---

## Product Direction Takeaway

Slopes is a good reminder that a mountain map product does not need to start with exotic overlays to feel high-value.

Their strongest mapping ideas are:

- maps tightly coupled to the live activity
- strong operational resort detail
- clear premium value in 3D / offline / replay
- just enough social context to make the map feel alive

For mtamta, the most useful borrow is not "copy Slopes' winter map." It is:

- make the map central to the user's live day and replay,
- add status/search layers that solve immediate mountain questions,
- and keep the data/privacy model disciplined.

---

## Sources Used

- Slopes privacy policy / data handling:
  - https://getslopes.com/data
- Slopes Premium features:
  - https://getslopes.com/premium
- iOS changelog:
  - https://getslopes.com/whatsnew_ios
- Slopes newsroom:
  - https://news.getslopes.com/about-slopes/
  - https://news.getslopes.com/slopes-app-expands-to-2-000-resorts-worldwide-on-interactive-3d-maps/
- Slopes engineering / product blog:
  - https://blog.getslopes.com/how-we-built-slopes-interactive-maps/
  - https://blog.getslopes.com/live-lift-trail-status-new-feature-for-an-epic-season/
