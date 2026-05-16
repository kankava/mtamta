# Phase 4: Trip System — Detailed Implementation Plan

> **Status: NOT STARTED**
>
> GPX upload & parsing, trip CRUD, trip routes on map with bbox query, photo upload with geotagging, map search bar, Radix UI, and climbing trip segments. Split into 4 sub-milestones (4a → 4b → 4c → 4d). Complete tasks top-to-bottom within each sub-milestone.

> **Multi-provider context**: Phase 4 builds on Phase 3.5 (multi-provider support — **M1 + M2 + M3 complete & verified**). Trip route code (`useTripRoutes`) targets `AppMapAdapter` and lives in `apps/web/src/map/runtime/shared/`. Map search (`MapSearch.tsx`) is Mapbox-specific and lives in `apps/web/src/map/runtime/mapbox/`; it is gated by the capability matrix (`coming_soon` for MapTiler). File paths below that reference the old `apps/web/src/map/MapContainer.tsx` should be read as the provider-specific runtime equivalents (`runtime/mapbox/MapContainer.tsx`, `runtime/maptiler/MapContainer.tsx`). See [`MapProviders.md`](MapProviders.md) for the runtime file structure.
>
> **Layer-insertion contract (settled in M3)**: the Mapbox runtime runs on **Mapbox Standard**, where custom layers go into named **slots** (`bottom`/`middle`/`top`) — not `beforeId`. `AppMapAdapter.addLayer(layer, opts?)` takes an optional `opts.slot`: the Mapbox adapter applies it as a Standard slot, the MapTiler/MapLibre adapter derives an equivalent `beforeId`. Trip-route layers **must pass a slot** (see §2). The adapter has no `getStyleLayers()`. Note also: Mapbox terrain is owned by the Standard style (always on); the 2D/3D button is a camera-pitch toggle — Phase 4 map code should not call `setTerrain()`.

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **4 sub-milestones: 4a (backend), 4b (map + UI), 4c (photos + search + Radix), 4d (climbing segments)** | 4a is pure backend with no frontend dependency. **4b is the trip MVP** — trips appear on the map and can be created/viewed. 4c and 4d are independent follow-ups that do not block the core trip flow. |
| 2 | **GPX parsing via `encoding/xml` directly** | GPX 1.1 is ~80 lines of Go structs. No third-party library needed — consistent with "simplicity over scalability" principle. |
| 3 | **S3 via `minio-go/v7` (Phase 4c)** | Deferred to 4c — only needed for photo uploads. Simpler API than `aws-sdk-go-v2`. Works with Cloudflare R2, MinIO, and any S3-compatible endpoint. GPX is multipart POST to API (no S3 needed). |
| 4 | **EXIF GPS via `rwcarlsen/goexif`** | Most widely used Go EXIF library. Resolution order: EXIF GPS coords → timestamp interpolation against GPX track → null. Interpolation is ~30 lines (binary search + linear interp). |
| 5 | **Trip routes on map via bbox GeoJSON endpoint** | `GET /api/v1/map/trips?bbox=...&zoom=...` returns FeatureCollection with zoom-dependent `ST_Simplify` and a feature cap. Frontend adds GeoJSON source + line layer, re-fetches on `moveend` (debounced). Click opens slide-in detail panel (not a new page). |
| 6 | **Routing: map panel + standalone pages** | Clicking a trip on the map opens an overlay panel (map stays visible). `/trips/:id` is for direct links/sharing. `/trips/new` is a standalone creation page. |
| 7 | **Migrations: 003 (trips), 004 (trip_photos), 005 (trip_segments)** | Follows existing numbering: 001 = init, 002 = email_normalize. |

---

## Sub-milestone 4a — GPX Parsing + Trip CRUD API

**Goal**: Backend can accept GPX files, parse them, store trips with PostGIS geometry, and serve trip CRUD endpoints. No S3 dependency — storage infrastructure deferred to 4c. The `gpx_file_url` column stays NULL in 4a/4b; raw GPX file persistence is added in 4c when S3 is available.

### 1. Migration 003: Trips table — `apps/api/migrations/003_trips.{up,down}.sql`

- [ ] Create `003_trips.up.sql`

```sql
CREATE TABLE trips (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    title            TEXT NOT NULL,
    description      TEXT,
    activity_type    TEXT NOT NULL,
    route            GEOGRAPHY(LineString, 4326),
    distance_m       FLOAT,
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s       INTEGER,
    start_point      GEOGRAPHY(Point, 4326),
    end_point        GEOGRAPHY(Point, 4326),
    gpx_file_url     TEXT,
    cover_photo_url  TEXT,
    is_public        BOOLEAN NOT NULL DEFAULT TRUE,
    status           TEXT NOT NULL DEFAULT 'published',
    source           TEXT NOT NULL DEFAULT 'manual',
    source_id        TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trips_route ON trips USING GIST(route);
CREATE INDEX idx_trips_start_point ON trips USING GIST(start_point);
CREATE INDEX idx_trips_activity_type ON trips(activity_type);
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status) WHERE status != 'published';
```

- [ ] Create `003_trips.down.sql`

```sql
DROP TABLE IF EXISTS trips;
```

### 2. GPX parser — `apps/api/internal/trip/gpx.go`

- [ ] Create GPX parser using `encoding/xml`

```go
package trip

type Trackpoint struct {
    Lat  float64
    Lon  float64
    Ele  *float64
    Time *time.Time
}

type GPXResult struct {
    Points       []Trackpoint
    WKT          string      // LINESTRING(...) for PostGIS
    DistanceM    float64     // sequential Haversine
    ElevGainM    float64
    ElevLossM    float64
    DurationS    int         // last.Time - first.Time
    StartPoint   [2]float64  // [lon, lat]
    EndPoint     [2]float64  // [lon, lat]
}

// ParseGPX parses GPX XML bytes and returns the result.
// Errors: ErrInvalidGPX, ErrNoTrackPoints, ErrGPXTooLarge
func ParseGPX(data []byte) (*GPXResult, error)
```

Key details:
- Concatenate all `<trkseg>` within all `<trk>` into a single point slice
- Build WKT `LINESTRING(lon1 lat1, lon2 lat2, ...)` for PostGIS
- Distance via sequential Haversine; elevation gain/loss by accumulating deltas
- Duration: `lastPoint.Time - firstPoint.Time`; nil if points lack timestamps
- Reject >50MB before parsing (`ErrGPXTooLarge`)

### 3. GPX parser tests — `apps/api/internal/trip/gpx_test.go`

- [ ] Table-driven unit tests (no database):
  - Valid single-track GPX with ele/time
  - Valid multi-segment GPX
  - GPX with missing elevation (parses, elevation = 0)
  - GPX with no trackpoints → `ErrNoTrackPoints`
  - Malformed XML → `ErrInvalidGPX`
  - Large GPX (>50MB) → `ErrGPXTooLarge`

### 4. Trip domain model — `apps/api/internal/trip/trip.go`

- [ ] Create `Trip` struct and activity type constants

```go
var ValidActivityTypes = []string{
    "ski", "backcountry_ski", "snowboard", "trail_run",
    "hike", "climb", "boulder", "alpinism", "bike", "other",
}

type Trip struct {
    ID             string
    UserID         string
    Title          string
    Description    *string
    ActivityType   string
    DistanceM      *float64
    ElevationGainM *float64
    ElevationLossM *float64
    DurationS      *int
    GpxFileURL     *string
    CoverPhotoURL  *string
    IsPublic       bool
    Status         string
    Source         string
    SourceID       *string
    CreatedAt      time.Time
    UpdatedAt      time.Time
}
```

### 5. Trip repository — `apps/api/internal/trip/repository.go`

- [ ] Create `Repository` following `user/repository.go` patterns (`const q =`, COALESCE, pgx scanning, sentinel errors)

Methods:
- `Create(ctx, t *Trip, routeWKT string) (*Trip, error)` — INSERT with `ST_GeogFromText($routeWKT)` for route
- `FindByID(ctx, id string) (*Trip, error)`
- `Update(ctx, id string, fields UpdateFields) (*Trip, error)` — COALESCE pattern
- `Delete(ctx, id string) error` — hard DELETE (Architecture specifies hard delete for trips)
- `FindByBBox(ctx, west, south, east, north float64, zoom int, limit int) ([]*TripGeoJSON, error)` — see bbox query spec below
- `ListByUser(ctx, userID string, limit, offset int) ([]*Trip, int, error)` — with total count

**Bbox query spec** (`FindByBBox`):

```sql
SELECT
    t.id,
    t.title,
    t.activity_type,
    t.distance_m,
    t.elevation_gain_m,
    ST_AsGeoJSON(
        ST_Simplify(t.route::geometry, $tolerance)
    ) AS geojson_geometry,
    ST_X(t.start_point::geometry) AS start_lng,
    ST_Y(t.start_point::geometry) AS start_lat
FROM trips t
WHERE t.is_public = TRUE
  AND t.status = 'published'
  AND t.route IS NOT NULL
  AND ST_Intersects(
        t.route,
        ST_MakeEnvelope($west, $south, $east, $north, 4326)::geography
      )
ORDER BY t.created_at DESC
LIMIT $limit
```

- **Cast**: `route::geometry` before `ST_Simplify` (ST_Simplify operates on geometry, not geography)
- **Tolerance by zoom**: `$tolerance` derived from zoom level in Go: `tolerance := 360.0 / math.Pow(2, float64(zoom)) / 256.0` (~1px at tile resolution). Examples: z5 → 0.00035, z10 → 0.000011, z15 → 0.0000003
- **Feature cap**: `$limit` defaults to 200, max 500. Handler validates.
- **Feature.properties shape**:
  ```json
  {
    "id": "uuid",
    "title": "Trip name",
    "activity_type": "ski",
    "distance_m": 12400.5,
    "elevation_gain_m": 890.0,
    "start_lng": 7.59,
    "start_lat": 46.05
  }
  ```

```go
var (
    ErrNotFound  = errors.New("trip not found")
    ErrForbidden = errors.New("not authorized to modify this trip")
)
```

### 6. Trip service — `apps/api/internal/trip/service.go`

- [ ] Create `Service` with `Repository` (no `storage.Client` in 4a — S3 added in 4c for photos)

Methods:
- `CreateWithGPX(ctx, userID, title, description, activityType string, gpxData []byte) (*Trip, error)` — validates, parses GPX, creates
- `Create(ctx, userID string, fields CreateFields) (*Trip, error)` — manual entry (no GPX)
- `GetByID(ctx, id string) (*Trip, error)`
- `Update(ctx, userID, tripID string, fields UpdateFields) (*Trip, error)` — checks ownership
- `Delete(ctx, userID, tripID string) error` — checks ownership
- `GetMapTrips(ctx, bbox BBox, zoom, limit int) (*GeoJSONFeatureCollection, error)` — assembles FeatureCollection with zoom-dependent simplification

Validation: Title max 200 chars, Description max 5000 chars, ActivityType must be in `ValidActivityTypes`.

### 7. Trip handler — `apps/api/internal/trip/handler.go`

- [ ] Create `Handler` following `user/handler.go` patterns

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/trips` | Create trip (multipart: GPX file + metadata, or JSON-only for manual entry). Route-specific 50MB MaxBody |
| `GET` | `/api/v1/trips/{id}` | Get trip by ID |
| `PATCH` | `/api/v1/trips/{id}` | Update trip (owner only) |
| `DELETE` | `/api/v1/trips/{id}` | Delete trip (owner only) |
| `GET` | `/api/v1/trips` | List trips (with activity_type, status, limit, offset filters) |
| `GET` | `/api/v1/map/trips` | Trip routes as GeoJSON FeatureCollection (public, `?bbox=w,s,e,n&zoom=z&limit=200`) |

### 8. Wiring in main.go — `apps/api/cmd/server/main.go`

- [ ] Construct trip repo/service/handler (no S3 in 4a)
- [ ] Register routes (authenticated group + public map endpoint)

```go
// Trips
tripRepo := trip.NewRepository(pool)
tripService := trip.NewService(tripRepo)
tripHandler := trip.NewHandler(tripService)

// Authenticated routes
r.With(middleware.MaxBody(50 << 20)).Post("/api/v1/trips", tripHandler.CreateTrip)
r.Get("/api/v1/trips/{id}", tripHandler.GetTrip)
r.Patch("/api/v1/trips/{id}", tripHandler.UpdateTrip)
r.Delete("/api/v1/trips/{id}", tripHandler.DeleteTrip)
r.Get("/api/v1/trips", tripHandler.ListTrips)

// Public
r.Get("/api/v1/map/trips", tripHandler.GetMapTrips)
```

### 9. Shared types — `packages/shared/src/types/trip.ts`

- [ ] Create Trip, TripPhoto, and UploadURLResponse types

```typescript
export type ActivityType =
  | 'ski' | 'backcountry_ski' | 'snowboard' | 'trail_run'
  | 'hike' | 'climb' | 'boulder' | 'alpinism' | 'bike' | 'other'

export type TripStatus = 'draft' | 'planned' | 'published'

export interface Trip {
  id: string
  user_id: string
  title: string
  description: string | null
  activity_type: ActivityType
  distance_m: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  duration_s: number | null
  gpx_file_url: string | null
  cover_photo_url: string | null
  is_public: boolean
  status: TripStatus
  source: string
  created_at: string
  updated_at: string
}

export interface TripPhoto {
  id: string
  trip_id: string
  key: string              // S3 object key, e.g. "photos/{trip_id}/{uuid}.jpg"
  url: string              // resolved pre-signed GET URL (computed by API, not stored)
  caption: string | null
  location: { lng: number; lat: number } | null
  taken_at: string | null
  sort_order: number
  created_at: string
}

export interface UploadURLResponse {
  url: string
  key: string
}
```

- [ ] Export from `packages/shared/src/index.ts`

### 10. Go dependency

- [ ] No new Go dependencies in 4a (GPX parser uses stdlib `encoding/xml`; `minio-go` deferred to 4c)

### 4a Verification Checklist

- [ ] Migration 003 creates trips table with all PostGIS indexes
- [ ] GPX parser unit tests pass (valid, multi-segment, empty, malformed)
- [ ] `POST /api/v1/trips` with multipart GPX file creates a trip with computed stats
- [ ] `POST /api/v1/trips` with JSON-only body creates a manual trip
- [ ] `GET /api/v1/trips/{id}` returns trip JSON
- [ ] `PATCH /api/v1/trips/{id}` updates title/description/activity_type (owner only)
- [ ] `DELETE /api/v1/trips/{id}` deletes trip (owner only, returns 204)
- [ ] `GET /api/v1/map/trips?bbox=...&zoom=10` returns GeoJSON FeatureCollection with simplified geometries
- [ ] Feature cap: limit=200 default, max=500
- [ ] Non-owner gets 403 on update/delete
- [ ] Invalid activity type returns 422

---

## Sub-milestone 4b — Trip Routes on Map + Trip UI

**Goal**: Trip routes appear as colored lines on the main map. Users can create trips via the web UI and view trip detail pages.

### 1. Trip store — `apps/web/src/stores/tripStore.ts`

- [ ] Create Zustand store

```typescript
interface TripState {
  mapTripsGeoJSON: GeoJSON.FeatureCollection | null
  isLoadingMapTrips: boolean
  activeTrip: Trip | null
  activeTripPhotos: TripPhoto[]
  myTrips: Trip[]
  myTripsTotal: number

  fetchMapTrips: (bbox: [number, number, number, number], zoom: number) => Promise<void>
  fetchTrip: (id: string) => Promise<void>
  fetchMyTrips: (offset?: number) => Promise<void>
  createTrip: (data: FormData) => Promise<Trip>
  updateTrip: (id: string, fields: Partial<Trip>) => Promise<void>
  deleteTrip: (id: string) => Promise<void>
  setActiveTrip: (trip: Trip | null) => void
  clearActiveTrip: () => void
}
```

### 2. Trip routes hook — `apps/web/src/map/runtime/shared/tripLayers.ts`

- [ ] Create `useTripRoutes(adapter)` hook targeting `AppMapAdapter` (follows `useRasterOverlays` pattern)

Responsibilities:
- On `moveend` (via `adapter.onMoveEnd`, debounced 500ms), get viewport bounds via `adapter.getBounds()` and zoom via `adapter.getZoom()`, call `tripStore.fetchMapTrips(bbox, zoom)`
- Add GeoJSON source + `line` layer (color by activity type) + `circle` layer (start points) via `adapter.addSource`/`adapter.addLayer`, passing `{ slot: 'top' }` to `addLayer` so routes draw above the basemap and topo rasters (M3 slot contract — the MapTiler adapter maps the slot to a `beforeId`)
- Click handler on line layer via `adapter.onClick`: extract trip_id, call `tripStore.fetchTrip(id)`, open detail panel
- Re-add source/layer on style reload via `adapter.onStyleLoad`

Activity type color mapping:
```typescript
const ACTIVITY_COLORS: Record<ActivityType, string> = {
  ski: '#3B82F6',             // blue
  backcountry_ski: '#8B5CF6', // violet
  snowboard: '#06B6D4',       // cyan
  trail_run: '#EF4444',       // red
  hike: '#F59E0B',            // amber
  climb: '#10B981',           // emerald
  boulder: '#84CC16',         // lime
  alpinism: '#6366F1',        // indigo
  bike: '#F97316',            // orange
  other: '#6B7280',           // gray
}
```

### 3. Runtime integration — each provider's `MapContainer.tsx`

- [ ] Wire `useTripRoutes(adapter)` in both `runtime/mapbox/MapContainer.tsx` and `runtime/maptiler/MapContainer.tsx` (adapter wraps the provider map instance)

### 4. Trip detail panel — `apps/web/src/map/TripDetailPanel.tsx`

- [ ] Slide-in panel (left side of map, overlay) showing:
  - Trip title, activity type badge, stats (distance, elevation, duration)
  - Mini elevation profile (simple SVG)
  - "View full detail" link to `/trips/:id`
  - Close button

### 5. Trip creation page — `apps/web/src/pages/TripCreatePage.tsx`

- [ ] Standalone page at `/trips/new`:
  - GPX file upload (drag-and-drop or file picker)
  - Title text input, description textarea
  - Activity type dropdown, status selector
  - On success, redirect to `/trips/:id`

### 6. GPX uploader component — `apps/web/src/components/GpxUploader.tsx`

- [ ] Drag-and-drop `.gpx` file upload
  - Client-side validation: max 50MB, `.gpx` extension
  - Shows file name and size after selection
  - Preview track on mini Mapbox map (client-side GPX coordinate extraction)

### 7. Trip detail page — `apps/web/src/pages/TripDetailPage.tsx`

- [ ] Standalone page at `/trips/:id`:
  - Full-width Mapbox map zoomed to fit route bounds
  - Stats bar: distance, elevation gain/loss, duration
  - Activity type badge, description
  - Photo gallery section (populated in Phase 4c)
  - Edit / Delete buttons (owner only)

### 8. Trip card component — `apps/web/src/components/TripCard.tsx`

- [ ] Compact trip preview for list views

### 9. Routing — `apps/web/src/App.tsx`

- [ ] Add lazy-loaded routes

```tsx
const TripCreatePage = lazy(() => import('./pages/TripCreatePage'))
const TripDetailPage = lazy(() => import('./pages/TripDetailPage'))

// In Routes:
<Route path="/trips/new" element={<Suspense ...><TripCreatePage /></Suspense>} />
<Route path="/trips/:id" element={<Suspense ...><TripDetailPage /></Suspense>} />
```

### 10. Layer registry — `packages/map-core/src/layers.ts`

- [ ] Add `trip-routes` layer definition

```typescript
{
  id: 'trip-routes',
  name: 'Trip Routes',
  category: 'data',
  description: 'User-uploaded trip routes within viewport',
  phase: 4,
  available: true,
}
```

### 4b Verification Checklist

- [ ] Trip routes appear as colored lines when browsing the map
- [ ] Routes are fetched on viewport change (debounced)
- [ ] Clicking a route opens the trip detail panel
- [ ] `/trips/new` page allows GPX upload with metadata
- [ ] Trip creation succeeds and redirects to detail page
- [ ] `/trips/:id` shows full trip detail with map and stats
- [ ] Only the trip owner sees edit/delete controls
- [ ] Routes re-appear after base style changes (style.load re-application works)

---

## Sub-milestone 4c — Photo Upload + Geotagging + Search Bar + Radix UI

**Goal**: S3 storage infrastructure, photo upload with geotagging, map search bar for geocoding, Radix UI for accessible dialogs and toasts. 4c does not block the trip MVP (4a + 4b).

### 1. S3 infrastructure — `docker-compose.yml` + `apps/api/internal/storage/s3.go` + `apps/api/internal/config/config.go`

- [ ] Add MinIO service to `docker-compose.yml` (local dev S3; production uses Cloudflare R2)

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: mtamta
    MINIO_ROOT_PASSWORD: mtamta123
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - miniodata:/data
```

- [ ] Add S3 config fields to `config.go`: `S3Endpoint`, `S3AccessKey`, `S3SecretKey`, `S3Bucket`, `S3UseSSL`
- [ ] Create `storage.Client` wrapping `minio-go/v7`: `PresignedPutURL` (with content-length-range condition, max 20MB), `PresignedGetURL`, `GetObject`, `DeleteObject`
- [ ] Go dependency: `go get github.com/minio/minio-go/v7`
- [ ] Wire S3 client into trip service: `tripService.SetStorage(s3Client)` — service operates without S3 for 4a/4b (GPX-only trips still work)
- [ ] Register `POST /api/v1/upload/url` endpoint (body: `{trip_id, file_ext, content_type}`). **Authenticated + verifies caller owns trip_id.** Server generates the key as `photos/{trip_id}/{uuid}.{ext}` — clients never choose keys. Returns `{url, key}`.

### 2. Migration 004: Trip photos table — `apps/api/migrations/004_trip_photos.{up,down}.sql`

- [ ] Create `004_trip_photos.up.sql`

```sql
CREATE TABLE trip_photos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    caption    TEXT,
    location   GEOGRAPHY(Point, 4326),
    taken_at   TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_photos_trip_id ON trip_photos(trip_id);
```

- [ ] Create `004_trip_photos.down.sql`

```sql
DROP TABLE IF EXISTS trip_photos;
```

### 3. Photo model — `apps/api/internal/trip/photo.go`

- [ ] Create `Photo` struct

```go
type Photo struct {
    ID        string
    TripID    string
    Key       string     // S3 object key (e.g. "photos/{trip_id}/{uuid}.jpg"), NOT an arbitrary URL
    Caption   *string
    Lat       *float64
    Lon       *float64
    TakenAt   *time.Time
    SortOrder int
    CreatedAt time.Time
}
```

- [ ] Add repository methods:
  - `CreatePhoto(ctx, p *Photo) (*Photo, error)` — INSERT with `ST_MakePoint($lon, $lat)::geography`
  - `ListPhotos(ctx, tripID string) ([]*Photo, error)` — ORDER BY sort_order
  - `DeletePhoto(ctx, photoID string) error`
  - `CountPhotos(ctx, tripID string) (int, error)` — for 50-photo-per-trip limit

### 4. Photo geotagging — `apps/api/internal/trip/exif.go`

- [ ] Create EXIF GPS extraction + timestamp interpolation

```go
// ExtractPhotoLocation determines a photo's GPS coordinates.
// Resolution order:
// 1. EXIF GPS coordinates (if present and valid)
// 2. Timestamp interpolation against GPX track
// 3. nil, nil (no location)
func ExtractPhotoLocation(photoData []byte, trackpoints []Trackpoint) (lat, lon *float64, takenAt *time.Time, err error)

// interpolatePosition binary searches for bracketing trackpoints, linearly interpolates lat/lon.
func interpolatePosition(t time.Time, points []Trackpoint) (lat, lon float64, ok bool)
```

- [ ] Go dependency: `go get github.com/rwcarlsen/goexif/exif`

### 5. Photo handler endpoints

- [ ] Add to trip handler:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/trips/{id}/photos` | Associate photo with trip (body: `{key, caption, sort_order}`). Server fetches object from S3 by key, extracts EXIF GPS |
| `GET` | `/api/v1/trips/{id}/photos` | List trip photos |
| `DELETE` | `/api/v1/photos/{id}` | Delete photo |

> **SSRF guard**: The `key` is a server-generated S3 object key (e.g. `photos/{trip_id}/{uuid}.jpg`), never client-chosen. The service validates the key matches the expected prefix `photos/{trip_id}/` and was generated by a prior `POST /upload/url` call before fetching from S3.

> **Photo validation** (in `AddPhoto` service method):
> 1. Validate key prefix matches `photos/{trip_id}/`
> 2. Fetch object from S3, reject if >20 MB or missing
> 3. Validate magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`) — reject non-image files
> 4. Extract EXIF GPS / timestamp for geotagging
> 5. Store photo record. Thumbnail generation is deferred (out of scope for 4c MVP — serve originals initially)
> 6. On EXIF extraction failure: store photo without location (non-fatal), log warning

- [ ] Add service methods:
  - `AddPhoto(ctx, userID, tripID, key, caption string, sortOrder int) (*Photo, error)` — validates key prefix + magic bytes, checks ownership, 50-photo limit, fetches from S3, extracts EXIF, stores record
  - `ListPhotos(ctx, tripID string) ([]*Photo, error)`
  - `DeletePhoto(ctx, userID, photoID string) error`

### 6. EXIF tests — `apps/api/internal/trip/exif_test.go`

- [ ] Test EXIF extraction with sample JPEG bytes
- [ ] Test timestamp interpolation with known trackpoints

### 7. Map search bar — `apps/web/src/map/runtime/mapbox/MapSearch.tsx`

- [ ] `@mapbox/search-js-react` SearchBox component (Mapbox-specific — lives inside `runtime/mapbox/`)
  - **Scope**: map geocoder only ("fly to place"). Full app-level search (trips, users, areas) is Phase 10.
  - Positioned top-left of map
  - On result select, calls `map.flyTo({center, zoom})`
  - Uses existing `VITE_MAPBOX_ACCESS_TOKEN`
  - No backend changes — Mapbox Search Box API called directly from client
  - **Provider gating**: wrapped in capability check; MapTiler provider shows `Coming soon` (MapTiler geocoder ships in M4 — provider-specific features, deferred to after Phase 4)
  - Update capability matrix: set Mapbox geocoder to `available` when this ships

Frontend dependency: `@mapbox/search-js-react`

### 8. Radix UI primitives — `apps/web/src/components/ui/`

- [ ] `Dialog.tsx` — styled Radix Dialog (photo viewer, confirmation dialogs)
- [ ] `DropdownMenu.tsx` — styled Radix DropdownMenu (trip action menu)
- [ ] `Toast.tsx` — styled Radix Toast (upload success/error, CRUD feedback)
- [ ] `ToastProvider.tsx` — wraps app with Radix ToastProvider (add to `App.tsx`)

Frontend dependencies:
```
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-toast
```

### 9. Photo gallery — `apps/web/src/components/PhotoGallery.tsx`

- [ ] Grid display of trip photos
  - Click opens full-screen viewer via Radix Dialog
  - Shows photo location on map if available

### 4c Verification Checklist

- [ ] Photos can be uploaded to a trip via pre-signed URL flow
- [ ] EXIF GPS coordinates are extracted and stored
- [ ] Photos without EXIF GPS get location via timestamp interpolation against GPX track
- [ ] Photos display in trip detail page gallery
- [ ] 50-photo-per-trip limit enforced
- [ ] Search bar geocodes locations and flies map to result
- [ ] Radix Dialog, DropdownMenu, and Toast work correctly
- [ ] Toast notifications show on trip create/update/delete/photo upload

---

## Sub-milestone 4d — Climbing Trip Segments

**Goal**: Climbing trips can have approach/climb/descent segments with per-pitch metadata. Vertical elevation profile visualization.

### 1. Migration 005: Trip segments table — `apps/api/migrations/005_trip_segments.{up,down}.sql`

- [ ] Create `005_trip_segments.up.sql`

```sql
CREATE TABLE trip_segments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    segment_type     TEXT NOT NULL,
    segment_order    INTEGER NOT NULL,
    track            GEOGRAPHY(LineString, 4326),
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s       INTEGER,
    pitches          JSONB,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_segments_trip_id ON trip_segments(trip_id);
```

- [ ] Create `005_trip_segments.down.sql`

```sql
DROP TABLE IF EXISTS trip_segments;
```

### 2. Segment model — `apps/api/internal/segment/segment.go`

- [ ] Create `Segment` and `Pitch` structs

```go
package segment

type Segment struct {
    ID             string
    TripID         string
    SegmentType    string    // "approach", "climb", "descent"
    SegmentOrder   int
    ElevationGainM *float64
    ElevationLossM *float64
    DurationS      *int
    Pitches        []Pitch
    CreatedAt      time.Time
}

type Pitch struct {
    Number     int               `json:"number"`
    Grade      map[string]string `json:"grade"`        // {"yds": "5.10a", "french": "6a+"}
    ElevationM *float64          `json:"elevation_m"`
    DurationS  *int              `json:"duration_s"`
    BelayType  *string           `json:"belay_type"`   // "bolted", "trad", "natural"
}
```

### 3. Segment repository — `apps/api/internal/segment/repository.go`

- [ ] CRUD methods:
  - `Create(ctx, s *Segment) (*Segment, error)` — INSERT with JSONB pitches
  - `ListByTrip(ctx, tripID string) ([]*Segment, error)` — ORDER BY segment_order
  - `Update(ctx, id string, fields UpdateFields) (*Segment, error)`
  - `Delete(ctx, id string) error`

### 4. Segment service — `apps/api/internal/segment/service.go`

- [ ] Methods:
  - `AddSegment(ctx, userID, tripID string, fields CreateFields) (*Segment, error)` — validates trip ownership, segment_type, activity_type must be "climb" or "alpinism"
  - `ListSegments(ctx, tripID string) ([]*Segment, error)`
  - `UpdateSegment(ctx, userID, segmentID string, fields UpdateFields) (*Segment, error)`
  - `DeleteSegment(ctx, userID, segmentID string) error`

### 5. Segment handler — `apps/api/internal/segment/handler.go`

- [ ] Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/trips/{id}/segments` | Add segment to trip |
| `GET` | `/api/v1/trips/{id}/segments` | List trip segments |
| `PATCH` | `/api/v1/trip-segments/{id}` | Update segment |
| `DELETE` | `/api/v1/trip-segments/{id}` | Delete segment |

### 6. Wiring — `apps/api/cmd/server/main.go`

- [ ] Construct segment repo/service/handler and register routes

```go
segmentRepo := segment.NewRepository(pool)
segmentService := segment.NewService(segmentRepo, tripRepo)
segmentHandler := segment.NewHandler(segmentService)
```

### 7. Shared segment types — `packages/shared/src/types/trip.ts`

- [ ] Add segment and pitch types

```typescript
export type SegmentType = 'approach' | 'climb' | 'descent'

export interface Pitch {
  number: number
  grade: Record<string, string>
  elevation_m: number | null
  duration_s: number | null
  belay_type: string | null
}

export interface TripSegment {
  id: string
  trip_id: string
  segment_type: SegmentType
  segment_order: number
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  duration_s: number | null
  pitches: Pitch[]
  created_at: string
}
```

### 8. Climbing profile visualization — `apps/web/src/components/ClimbingProfile.tsx`

- [ ] SVG vertical stacked bar chart:
  - Each bar = one pitch, height proportional to `elevation_m`
  - Color mapped to grade difficulty (via `@openbeta/sandbag`)
  - Labels: pitch number and grade in user's preferred system
  - Segments shown as labeled sections (approach → climb → descent)

Frontend dependency: `@openbeta/sandbag`

### 9. Segment editor — `apps/web/src/components/SegmentEditor.tsx`

- [ ] Trip detail page component (owner only):
  - Add segment button with type selector
  - Per-segment: elevation gain, duration, pitch count
  - Per-pitch form: grade inputs (multi-system), elevation, duration, belay type

### 10. Climbing-aware trip detail — `apps/web/src/pages/TripDetailPage.tsx`

- [ ] If `activity_type` is "climb" or "alpinism", show segments section + `ClimbingProfile`

### 4d Verification Checklist

- [ ] Can add approach/climb/descent segments to a climbing trip
- [ ] Cannot add segments to non-climbing trips (returns 422)
- [ ] Each climb segment supports per-pitch metadata
- [ ] Grades stored as multi-system JSONB
- [ ] `@openbeta/sandbag` converts and displays grades correctly
- [ ] Vertical elevation profile renders with pitch-by-pitch stacked bars
- [ ] Segment CRUD works with ownership checks
- [ ] Segment data persists correctly in JSONB pitches column

---

## Testing Strategy

### Go backend

**Unit tests** (no database):
- `trip/gpx_test.go` — all GPX parsing scenarios
- `trip/exif_test.go` — EXIF extraction, timestamp interpolation
- `segment/service_test.go` — validation (invalid segment type, invalid activity type, ownership)

**Integration tests** (`//go:build integration`):
- `trip/repository_test.go` — follows `user/repository_test.go` pattern: Create + FindByID + FindByBBox + Delete
- PostGIS spatial queries: insert trip with known route, query by containing bbox (found) and non-containing bbox (empty)
- Photo creation with PostGIS Point geometry
- Segment CRUD with JSONB pitches

### Frontend

**Vitest unit tests**:
- `tripStore.test.ts` — store actions with mocked API client

**Component tests** (React Testing Library):
- `GpxUploader` — drag-and-drop, file validation, size limit
- `ClimbingProfile` — rendering with known pitch data

### Test data

- `data/seed/trips.sql` — sample trip data with PostGIS geometries
- `data/seed/gpx/` — sample GPX files: `simple_track.gpx`, `multi_segment.gpx`, `no_elevation.gpx`, `climbing_route.gpx`

---

## Dependency Summary

### Go (add to go.mod)

| Package | Purpose | Phase |
|---------|---------|-------|
| `github.com/minio/minio-go/v7` | S3 client | 4c |
| `github.com/rwcarlsen/goexif/exif` | EXIF GPS extraction | 4c |

### Frontend (add to apps/web/package.json)

| Package | Purpose | Phase |
|---------|---------|-------|
| `@mapbox/search-js-react` | Map search bar | 4c |
| `@radix-ui/react-dialog` | Dialogs | 4c |
| `@radix-ui/react-dropdown-menu` | Dropdown menus | 4c |
| `@radix-ui/react-toast` | Toast notifications | 4c |
| `@openbeta/sandbag` | Climbing grade conversion | 4d |

### Environment variables (new)

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | `localhost:9000` | S3/MinIO endpoint |
| `S3_ACCESS_KEY` | `mtamta` | S3 access key |
| `S3_SECRET_KEY` | `mtamta123` | S3 secret key |
| `S3_BUCKET` | `mtamta` | S3 bucket name |
| `S3_USE_SSL` | `false` | Use SSL for S3 |

---

## Files Summary

**New files (Phase 4a — 10):**
- `apps/api/internal/trip/trip.go`
- `apps/api/internal/trip/gpx.go`
- `apps/api/internal/trip/gpx_test.go`
- `apps/api/internal/trip/repository.go`
- `apps/api/internal/trip/repository_test.go`
- `apps/api/internal/trip/service.go`
- `apps/api/internal/trip/handler.go`
- `apps/api/migrations/003_trips.up.sql`
- `apps/api/migrations/003_trips.down.sql`
- `packages/shared/src/types/trip.ts`

**Modified files (Phase 4a — 2):**
- `apps/api/cmd/server/main.go` — wire trip repo/service/handler
- `packages/shared/src/index.ts` — export trip types

**New files (Phase 4b — 7):**
- `apps/web/src/stores/tripStore.ts`
- `apps/web/src/map/runtime/shared/tripLayers.ts`
- `apps/web/src/map/TripDetailPanel.tsx`
- `apps/web/src/pages/TripCreatePage.tsx`
- `apps/web/src/pages/TripDetailPage.tsx`
- `apps/web/src/components/GpxUploader.tsx`
- `apps/web/src/components/TripCard.tsx`

**Modified files (Phase 4b — 4):**
- `apps/web/src/App.tsx` — add routes
- `apps/web/src/map/runtime/mapbox/MapContainer.tsx` — wire useTripRoutes hook
- `apps/web/src/map/runtime/maptiler/MapContainer.tsx` — wire useTripRoutes hook
- `packages/map-core/src/layers.ts` — add trip-routes layer definition

**New files (Phase 4c — 12):**
- `apps/api/internal/storage/s3.go`
- `apps/api/internal/trip/photo.go`
- `apps/api/internal/trip/exif.go`
- `apps/api/internal/trip/exif_test.go`
- `apps/api/migrations/004_trip_photos.up.sql`
- `apps/api/migrations/004_trip_photos.down.sql`
- `apps/web/src/map/runtime/mapbox/MapSearch.tsx`
- `apps/web/src/components/ui/Dialog.tsx`
- `apps/web/src/components/ui/DropdownMenu.tsx`
- `apps/web/src/components/ui/Toast.tsx`
- `apps/web/src/components/ui/ToastProvider.tsx`
- `apps/web/src/components/PhotoGallery.tsx`

**Modified files (Phase 4c — 9):**
- `apps/api/internal/config/config.go` — add S3 fields
- `apps/api/internal/trip/repository.go` — add photo methods
- `apps/api/internal/trip/service.go` — add photo methods + SetStorage
- `apps/api/internal/trip/handler.go` — add photo + upload-url endpoints
- `apps/api/cmd/server/main.go` — wire S3 client, register photo routes + upload-url
- `apps/api/go.mod` — add minio-go, goexif
- `docker-compose.yml` — add MinIO service
- `apps/web/src/map/runtime/mapbox/MapContainer.tsx` — add MapSearch (Mapbox provider only)
- `apps/web/src/App.tsx` — add ToastProvider wrapper
- `apps/web/src/pages/TripDetailPage.tsx` — add photo gallery
- `apps/web/package.json` — add search-js, radix dependencies

**New files (Phase 4d — 8):**
- `apps/api/internal/segment/segment.go`
- `apps/api/internal/segment/repository.go`
- `apps/api/internal/segment/service.go`
- `apps/api/internal/segment/handler.go`
- `apps/api/migrations/005_trip_segments.up.sql`
- `apps/api/migrations/005_trip_segments.down.sql`
- `apps/web/src/components/ClimbingProfile.tsx`
- `apps/web/src/components/SegmentEditor.tsx`

**Modified files (Phase 4d — 5):**
- `apps/api/cmd/server/main.go` — wire segment handler
- `packages/shared/src/types/trip.ts` — add segment types
- `apps/web/src/pages/TripDetailPage.tsx` — add climbing sections
- `apps/web/src/stores/tripStore.ts` — add segment state/actions
- `apps/web/package.json` — add @openbeta/sandbag

---

### Critical Reference Files

- `apps/api/internal/user/repository.go` — reference pattern for all new repository files (SQL const, COALESCE updates, pgx scanning, sentinel errors)
- `apps/api/cmd/server/main.go` — wiring point for all new handlers/services/repos
- `apps/web/src/map/runtime/shared/rasterOverlays.ts` — exact pattern to follow for tripLayers (AppMapAdapter usage, style.load handling)
- `apps/web/src/map/runtime/shared/mapAdapter.ts` — AppMapAdapter interface that tripLayers targets
- `docs/Architecture.md` lines 1121–1167 — authoritative trips and trip_photos schemas
