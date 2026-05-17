# Manual Verification Checklist

> Pre-Phase 4 verification for all implemented phases. Covers Phase 1 (Foundation), Phase 2 (Maps Core), Phase 3 (Map Sources & Overlays), and Phase 3.5 (Multi-Provider Support).
>
> Phases 1 & 2 have been deployed and in use — their checks are a quick sanity pass. Phase 3 and 3.5 require more thorough testing.
>
> The combined walkthrough at the bottom merges everything into a single test session.

---

## Phase 1 — Foundation

- [ ] `make dev` starts all services (docker-compose + Go API with hot reload + Vite dev server)
- [ ] `make seed` loads sample data successfully
- [ ] `POST /api/v1/auth/google` with a valid Google ID token returns a JWT pair
- [ ] `GET /api/v1/users/me` with a valid JWT returns the current user
- [ ] Web app renders, allows Google Sign-In, and displays the logged-in user's name
- [ ] `POST /api/v1/auth/logout` invalidates the refresh token
- [ ] `GET /api/v1/health` returns dependency status (postgres, redis) and HTTP 503 if any are down
- [ ] GitHub Actions CI passes on push (go test + turbo build + lint)

> Automated (already passing — just confirm):
> - Auth token unit tests (valid, expired, malformed)
> - Integration test (mock ID token → JWT pair → authenticated request)
> - Database migrations on fresh instance
> - Shared types importable from `apps/web` and `packages/shared`

## Phase 2 — Maps Core

- [ ] Map renders full-screen on page load at a default location
- [ ] User can switch between topographic and satellite base layers
- [ ] User can toggle winter/summer mode and the map style updates
- [ ] 3D terrain can be enabled; tilting the map shows terrain relief
- [ ] Map state (center, zoom, layers) persists across style switches
- [ ] Map is responsive and usable on tablet-sized screens

## Phase 3 — Map Sources & Overlays

### Basemap cards and topo overlays

- [ ] Open map → Satellite Summer basemap on startup, no topo overlay
- [ ] Click each basemap card — map style and topo overlay change correctly
- [ ] Basemap cards atomically set baseLayer + season + topoSource in one action
- [ ] Clicking a country topo card (e.g. swisstopo) loads the topo overlay
- [ ] Switching back to a global Outdoors card removes the topo overlay
- [ ] Satellite Summer is used as default for both Mapbox and MapTiler (`topoSource: null`)
- [ ] OpenTopoMap card (3rd Global topo card) loads worldwide topo tiles in both Mapbox and MapTiler
- [ ] Country-specific topo sources render for all 6 supported countries (CH, FR, AT, DE, NO, US)
- [ ] Map attribution updates dynamically to reflect the active topo source

### Winter/seasonal

- [ ] Selecting a winter basemap card sets the base layer, season, and topo source atomically (overlays are toggled separately in the Overlays tab)
- [ ] swisstopo winter card loads winter base map variant (`pixelkarte-farbe-winter`)
- [ ] swisstopo ski touring and snowshoe route overlays available to toggle with swisstopo winter card
- [ ] OpenSnowMap pistes layer renders as a toggleable overlay
- [ ] _(Deferred)_ Seasonal Sentinel-2 satellite view — backend proxy exists; frontend card disabled, not yet enabled

### Tile proxy and caching (requires API running)

- [ ] OpenTopoMap tiles proxied through `/api/v1/tiles/opentopomap/...`
- [ ] IGN tiles load directly from `data.geopf.fr` (public PLANIGNV2 endpoint, no backend proxy)
- [ ] _(Deferred)_ Sentinel-2 tiles proxied through backend (Instance ID not exposed)
- [ ] Country topo tiles cached in Redis with 24-hour TTL
- [ ] _(Deferred)_ Sentinel-2 tiles cached in Redis with 7-day TTL

### UI

- [ ] Sidebar opens/collapses, map fills full width when collapsed
- [ ] Switch to satellite → topo overlay hidden

## Phase 3.5 M1 — Mapbox Runtime

- [ ] Auth → provider gate → select Mapbox → map loads with zero regression
- [ ] localStorage persists provider, gate skipped on reload
- [ ] Settings shows "Map Engine" with provider name and "Change" button
- [ ] "Change" button returns to provider gate
- [ ] All overlays work after extraction (topo, pistes, ski touring, snowshoe)
- [ ] Terrain and sky layer work
- [ ] Style switching preserves overlays and terrain
- [ ] Build produces clean chunks, no warnings

## Phase 3.5 M2 — MapTiler Runtime

- [ ] Select MapTiler from gate → map renders with outdoors style
- [ ] Switch to satellite → satellite renders
- [ ] 3D terrain works in MapTiler
- [ ] Shared overlays render in MapTiler via AppMapAdapter
- [ ] Globe projection works in both providers
- [ ] Winter basemap cards enabled for both providers; MapTiler switches to winter-v2 style
- [ ] Only selected provider's SDK chunk is loaded (check Network tab)
- [ ] Switching providers via Settings works cleanly

---

## Combined Walkthrough

Work through this sequence to cover all checks in one session.

### 1. API and dev environment

```sh
make dev
```

- [ ] All services start (docker-compose + Go API + Vite dev server)
- [ ] `GET /api/v1/health` returns OK with postgres/redis status

### 2. Auth flow

- [ ] Google Sign-In works, user name displayed
- [ ] Logout works, refresh token invalidated
- [ ] Re-login works

### 3. Provider gate (fresh start)

Clear localStorage (`mtamta:mapProvider`) or use incognito.

- [ ] Provider gate appears after login
- [ ] Both Mapbox and MapTiler buttons are enabled

### 4. Mapbox flow

Select **Mapbox** from the gate.

- [ ] Map loads full-screen with Satellite Summer, no topo overlay
- [ ] Switch between topographic and satellite base layers
- [ ] Toggle winter/summer mode → style updates
- [ ] Click each basemap card → style and topo overlay change atomically
- [ ] Select "swisstopo" → tiles render, attribution updates
- [ ] Switch to satellite → topo overlay hidden
- [ ] Select "swisstopo Winter" → pixelkarte-farbe-winter base; pistes + ski touring/snowshoe overlays available to toggle in the Overlays tab
- [ ] Switch to "Outdoors Summer" → topo removed, Mapbox Outdoors only
- [ ] Test all 6 country topo sources (CH, FR, AT, DE, NO, US)
- [ ] Enable terrain → 3D terrain and sky layer work
- [ ] Switch style with terrain on → terrain + overlays re-apply
- [ ] Sidebar collapses/expands, map fills width when collapsed
- [ ] Map state (center, zoom) persists across style switches
- [ ] Responsive on tablet-sized viewport

### 5. Settings + persistence

- [ ] Open Settings → "Map Engine" shows "Mapbox GL JS" with Change button
- [ ] Reload page → gate is skipped, Mapbox loads directly

### 6. Switch to MapTiler

Click **Change** in Settings.

- [ ] Gate re-appears

Select **MapTiler**.

- [ ] Map renders with MapTiler satellite style by default
- [ ] Switch to satellite → satellite renders
- [ ] Enable terrain → 3D terrain works
- [ ] Shared overlays (topo, pistes) render via adapter
- [ ] Toggle globe projection → globe works in MapTiler
- [ ] Switch back to Mapbox later → globe works there too
- [ ] Select Global Winter → MapTiler switches to winter-v2 (pistes, lifts, winter palette)

### 7. Chunk isolation (DevTools → Network tab)

- [ ] With Mapbox selected: only `mapbox-gl` chunk loaded, no `maptiler-sdk`
- [ ] With MapTiler selected: only `maptiler-sdk` chunk loaded, no `mapbox-gl`

### 8. Tile proxy and caching (requires API)

- [ ] OpenTopoMap tiles load through `/api/v1/tiles/opentopomap/...`
- [ ] IGN tiles load directly from `data.geopf.fr` (no API key in browser requests)
- [ ] Sentinel-2 tiles proxied (no Instance ID in browser requests)
- [ ] Second tile request faster (Redis cache hit)

### 9. Build verification

```sh
pnpm --filter @mtamta/web build
```

- [ ] Clean build, no warnings
- [ ] Output shows separate chunks for mapbox-gl and maptiler-sdk

---

## After verification

Once all checks pass, update the verification checklists in:

- `docs/Phase3.md` — manual testing items (lines 306-315)
- `docs/Phase3_5.md` — M1 checklist (lines 158-166) and M2 checklist (lines 208-216)
- `docs/MapProviders.md` — M1 verification (lines 259-265) and M2 verification (lines 280-286)
- `docs/Plan.md` — acceptance criteria for Phase 1 (lines 159-178), Phase 2 (lines 264-270), Phase 3 (lines 367-382), Phase 3.5 (lines 458-465)

## Extra
  How each topo server behaves outside its borders

  ┌─────────────────┬────────────┬───────────────────────────────────────────┬───────────────────────────────────────────────┐
  │     Source      │   Format   │             Outside behavior              │                 Overlay-safe?                 │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ Kartverket (NO) │ PNG RGBA   │ Fully transparent tiles                   │ Yes — ideal                                   │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ swisstopo (CH)  │ JPEG       │ HTTP 400 (tile rejected)                  │ Yes — map engine shows nothing                │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ basemap.at (AT) │ JPEG       │ HTTP 404 (far), white bleed (near border) │ Mostly — 404s are fine, slight bleed at edges │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ IGN (FR)        │ PNG opaque │ Solid white tiles                         │ No — white rectangles over base map           │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ BKG (DE)        │ PNG opaque │ Full global topo data                     │ No — covers entire world                      │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ USGS (US)       │ JPEG       │ Full global topo data                     │ No — covers entire world                      │
  ├─────────────────┼────────────┼───────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ OpenTopoMap     │ PNG opaque │ Full global topo data                     │ No — global by design                         │
  └─────────────────┴────────────┴───────────────────────────────────────────┴───────────────────────────────────────────────┘

  Check the tile bounds for each map.
