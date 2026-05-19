# Phase 4: Activity System — Detailed Implementation Plan

> **Status: NOT STARTED**
>
> GPX upload & parsing, manual activity entry, activity CRUD, activity tracks on the map with bbox query, photo upload with geotagging, map search bar, Radix UI, and climbing activity segments. Split into 4 sub-milestones (4a → 4b → 4c → 4d). Complete tasks top-to-bottom within each sub-milestone.

> **Multi-provider context**: Phase 4 builds on Phase 3.5 (multi-provider support — **M1 + M2 + M3 complete & verified**). Activity-track code (`useActivityTracks`) targets `AppMapAdapter` and lives in `apps/web/src/map/runtime/shared/`. Map search (`MapSearch.tsx`) is Mapbox-specific and lives in `apps/web/src/map/runtime/mapbox/`; it is gated by the capability matrix (`coming_soon` for MapTiler). File paths below that reference the old `apps/web/src/map/MapContainer.tsx` should be read as the provider-specific runtime equivalents (`runtime/mapbox/MapContainer.tsx`, `runtime/maptiler/MapContainer.tsx`). See [`MapProviders.md`](MapProviders.md) for the runtime file structure.
>
> **Layer-insertion contract (settled in M3)**: the Mapbox runtime runs on **Mapbox Standard**, where custom layers go into named **slots** (`bottom`/`middle`/`top`) — not `beforeId`. `AppMapAdapter.addLayer(layer, opts?)` takes an optional `opts.slot`: the Mapbox adapter applies it as a Standard slot, the MapTiler/MapLibre adapter derives an equivalent `beforeId`. Activity-track layers **must pass a slot** (see §4b.2). The adapter has no `getStyleLayers()`. Note also: Mapbox terrain is always on (applied in `runtime/mapbox/MapContainer.tsx`); the 2D/3D button is a camera-pitch toggle. Phase 4 activity-track code adds layers only — it should not touch terrain.

> **Activity vs Route**: a recorded **activity** is what Phase 4 builds. A planned **route** is a separate entity (`routes` table, `activities.route_id` link) designed in `Architecture.md` but built in a later route-planning phase. Phase 4 does not build routes.

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **4 sub-milestones: 4a (backend), 4b (map + UI), 4c (photos + search + Radix), 4d (climbing segments)** | 4a is pure backend with no frontend dependency. **4b is the activity MVP** — activities appear on the map and can be created/viewed. 4c and 4d are independent follow-ups that do not block the core flow. |
| 2 | **GPX parsing via `encoding/xml` directly** | GPX 1.1 is ~80 lines of Go structs. No third-party library needed — consistent with "simplicity over scalability" principle. |
| 3 | **One unified create flow: metadata form + optional GPX** | An activity is created from a metadata form; a GPX file is optional. If attached, it is parsed to pre-fill the `track` + stats (user can override); if absent, the activity is manual entry. This mirrors Garmin/Strava, where file-upload and manual entry converge. `source` records which (`gpx` vs `manual`). |
| 4 | **Format-neutral parser output (`ParsedActivity`)** | `ParseGPX` returns a `ParsedActivity` struct, distinct from the `Activity` entity. The service consumes `ParsedActivity`, so Phase 5's `ParseFIT` slots in behind the same seam without a service rewrite. |
| 5 | **S3 via `minio-go/v7` (Phase 4c)** | Deferred to 4c — only needed for photo uploads and raw-file persistence. Simpler API than `aws-sdk-go-v2`. Works with Cloudflare R2, MinIO, and any S3-compatible endpoint. GPX is multipart POST to API (no S3 needed to parse it). |
| 6 | **EXIF GPS via `rwcarlsen/goexif`** | Most widely used Go EXIF library. Resolution order: EXIF GPS coords → timestamp interpolation against the GPX track → null. Interpolation is ~30 lines (binary search + linear interp). |
| 7 | **Activity tracks on map via bbox GeoJSON endpoint** | `GET /api/v1/map/activities?bbox=...&zoom=...` returns a FeatureCollection with zoom-dependent `ST_Simplify` and a feature cap, `visibility='public'` only. Frontend adds a GeoJSON source + line layer, re-fetches on `moveend` (debounced). Click opens a slide-in detail panel (not a new page). |
| 8 | **Migrations: 003 (activities), 004 (activity_photos), 005 (activity_segments)** | Follows existing numbering: 001 = init, 002 = email_normalize. Migration 003 includes the device-sync columns (`source`, `source_id`, `original_file_*`) from the start — no Phase 5 `ALTER`. |

---

## Sub-milestone 4a — GPX Parsing + Activity CRUD API

**Goal**: Backend can accept an activity (metadata + optional GPX file), parse the GPX, store activities with PostGIS geometry, and serve activity CRUD endpoints. No S3 dependency — storage infrastructure deferred to 4c. `original_file_url`/`original_file_format` stay NULL in 4a/4b; raw file persistence is added in 4c when S3 is available.

### 1. Migration 003: Activities table — `apps/api/migrations/003_activities.{up,down}.sql`

- [ ] Create `003_activities.up.sql`

```sql
CREATE TABLE activities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id),
    title                TEXT NOT NULL,
    description          TEXT,
    activity_type        TEXT NOT NULL,
    track                GEOGRAPHY(LineString, 4326),  -- recorded path; NULL for manual entry
    started_at           TIMESTAMPTZ,                  -- when the activity occurred
    distance_m           FLOAT,
    elevation_gain_m     FLOAT,
    elevation_loss_m     FLOAT,
    duration_s           INTEGER,
    start_point          GEOGRAPHY(Point, 4326),
    end_point            GEOGRAPHY(Point, 4326),
    metrics              JSONB,   -- activity-type-specific + device-rich stats
    original_file_url    TEXT,    -- raw uploaded/synced file (populated in 4c)
    original_file_format TEXT,    -- 'gpx' | 'fit'
    cover_photo_url      TEXT,
    visibility           TEXT NOT NULL DEFAULT 'public',     -- 'private' | 'followers' | 'public'
    status               TEXT NOT NULL DEFAULT 'published',  -- 'draft' | 'published'
    source               TEXT NOT NULL DEFAULT 'manual',     -- 'manual' | 'gpx' | 'garmin' | ...
    source_id            TEXT,
    route_id             UUID,    -- optional link to a planned route; FK added with the routes migration
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_track ON activities USING GIST(track);
CREATE INDEX idx_activities_start_point ON activities USING GIST(start_point);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_user_id ON activities(user_id, started_at DESC NULLS LAST);
CREATE INDEX idx_activities_status ON activities(status) WHERE status != 'published';
```

- [ ] Create `003_activities.down.sql`

```sql
DROP TABLE IF EXISTS activities;
```

### 2. GPX parser — `apps/api/internal/activity/gpx.go`

- [ ] Create GPX parser using `encoding/xml`, producing a format-neutral `ParsedActivity`

```go
package activity

type Trackpoint struct {
    Lat  float64
    Lon  float64
    Ele  *float64
    Time *time.Time
}

// ParsedActivity is the format-neutral output of parsing an uploaded file.
// ParseGPX produces it now; ParseFIT will produce it in Phase 5. It is NOT
// the Activity entity — the service maps it into a new Activity row.
type ParsedActivity struct {
    Points     []Trackpoint
    TrackWKT   string      // LINESTRING(...) for PostGIS
    DistanceM  float64     // sequential Haversine
    ElevGainM  float64
    ElevLossM  float64
    DurationS  *int        // last.Time - first.Time; nil if points lack timestamps
    StartedAt  *time.Time  // first trackpoint timestamp
    StartPoint [2]float64  // [lon, lat]
    EndPoint   [2]float64  // [lon, lat]
}

// ParseGPX parses GPX XML bytes into a ParsedActivity.
// Errors: ErrInvalidGPX, ErrNoTrackPoints, ErrGPXTooLarge
func ParseGPX(data []byte) (*ParsedActivity, error)
```

Key details:
- Concatenate all `<trkseg>` within all `<trk>` into a single point slice
- Build WKT `LINESTRING(lon1 lat1, lon2 lat2, ...)` for PostGIS
- Distance via sequential Haversine; elevation gain/loss by accumulating deltas
- `StartedAt` = first trackpoint's timestamp (nil if absent); `DurationS` = last − first
- Reject >50MB before parsing (`ErrGPXTooLarge`)

### 3. GPX parser tests — `apps/api/internal/activity/gpx_test.go`

- [ ] Table-driven unit tests (no database):
  - Valid single-track GPX with ele/time
  - Valid multi-segment GPX
  - GPX with missing elevation (parses, elevation = 0)
  - GPX with no trackpoints → `ErrNoTrackPoints`
  - Malformed XML → `ErrInvalidGPX`
  - Large GPX (>50MB) → `ErrGPXTooLarge`

### 4. Activity domain model — `apps/api/internal/activity/activity.go`

- [ ] Create `Activity` struct and activity type constants

```go
var ValidActivityTypes = []string{
    "ski", "backcountry_ski", "snowboard", "trail_run",
    "hike", "climb", "boulder", "alpinism", "bike", "other",
}

type Activity struct {
    ID                 string
    UserID             string
    Title              string
    Description        *string
    ActivityType       string
    StartedAt          *time.Time
    DistanceM          *float64
    ElevationGainM     *float64
    ElevationLossM     *float64
    DurationS          *int
    Metrics            map[string]any  // activity-type-specific stats
    OriginalFileURL    *string
    OriginalFileFormat *string         // "gpx" | "fit"
    CoverPhotoURL      *string
    Visibility         string          // "private" | "followers" | "public"
    Status             string          // "draft" | "published"
    Source             string          // "manual" | "gpx" | "garmin" | ...
    SourceID           *string
    RouteID            *string
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

The recorded `track` geometry is not a struct field — it is passed to/from the repository as WKT (see below), consistent with `user/repository.go` patterns.

### 5. Activity repository — `apps/api/internal/activity/repository.go`

- [ ] Create `Repository` following `user/repository.go` patterns (`const q =`, COALESCE, pgx scanning, sentinel errors)

Methods:
- `Create(ctx, a *Activity, trackWKT string) (*Activity, error)` — INSERT with `ST_GeogFromText($trackWKT)` for `track` (trackWKT empty → NULL track, for manual entry)
- `FindByID(ctx, id string) (*Activity, error)`
- `Update(ctx, id string, fields UpdateFields) (*Activity, error)` — COALESCE pattern
- `Delete(ctx, id string) error` — hard DELETE (Architecture specifies hard delete for activities)
- `FindByBBox(ctx, west, south, east, north float64, zoom int, limit int) ([]*ActivityGeoJSON, error)` — see bbox query spec below
- `ListByUser(ctx, userID string, limit, offset int) ([]*Activity, int, error)` — caller's own activities, with total count

**Bbox query spec** (`FindByBBox`):

```sql
SELECT
    a.id,
    a.title,
    a.activity_type,
    a.distance_m,
    a.elevation_gain_m,
    ST_AsGeoJSON(
        ST_Simplify(a.track::geometry, $tolerance)
    ) AS geojson_geometry,
    ST_X(a.start_point::geometry) AS start_lng,
    ST_Y(a.start_point::geometry) AS start_lat
FROM activities a
WHERE a.visibility = 'public'
  AND a.status = 'published'
  AND a.track IS NOT NULL
  AND ST_Intersects(
        a.track,
        ST_MakeEnvelope($west, $south, $east, $north, 4326)::geography
      )
ORDER BY a.started_at DESC NULLS LAST
LIMIT $limit
```

- **Cast**: `track::geometry` before `ST_Simplify` (ST_Simplify operates on geometry, not geography)
- **Tolerance by zoom**: `$tolerance` derived from zoom level in Go: `tolerance := 360.0 / math.Pow(2, float64(zoom)) / 256.0` (~1px at tile resolution). Examples: z5 → 0.00035, z10 → 0.000011, z15 → 0.0000003
- **Feature cap**: `$limit` defaults to 200, max 500. Handler validates.
- **Feature.properties shape**:
  ```json
  {
    "id": "uuid",
    "title": "Activity name",
    "activity_type": "ski",
    "distance_m": 12400.5,
    "elevation_gain_m": 890.0,
    "start_lng": 7.59,
    "start_lat": 46.05
  }
  ```

```go
var (
    ErrNotFound  = errors.New("activity not found")
    ErrForbidden = errors.New("not authorized to modify this activity")
)
```

### 6. Activity service — `apps/api/internal/activity/service.go`

- [ ] Create `Service` with `Repository` (no `storage.Client` in 4a — S3 added in 4c for photos)

Methods:
- `Create(ctx, userID string, fields CreateFields, gpxData []byte) (*Activity, error)` — the **one unified create**. `gpxData` may be `nil`:
  - **GPX present** → `ParseGPX` → derive `track`, `started_at`, distance/elevation/duration as defaults; `source = "gpx"`. Submitted `fields` override parsed values.
  - **GPX absent** → manual entry; `track` is NULL; stats come from `fields`; `source = "manual"`.
- `GetByID(ctx, id string) (*Activity, error)`
- `Update(ctx, userID, activityID string, fields UpdateFields) (*Activity, error)` — checks ownership
- `Delete(ctx, userID, activityID string) error` — checks ownership
- `GetMapActivities(ctx, bbox BBox, zoom, limit int) (*GeoJSONFeatureCollection, error)` — assembles FeatureCollection with zoom-dependent simplification
- `ListMyActivities(ctx, userID string, limit, offset int) ([]*Activity, int, error)`

Validation: Title max 200 chars, Description max 5000 chars, ActivityType must be in `ValidActivityTypes`, Visibility in `{private, followers, public}`. `metrics` is stored as freeform JSONB — the activity-type-aware shape is enforced by the frontend form, not the backend.

### 7. Activity handler — `apps/api/internal/activity/handler.go`

- [ ] Create `Handler` following `user/handler.go` patterns

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/activities` | Create activity (multipart: metadata fields + optional GPX file). Route-specific 50MB MaxBody |
| `GET` | `/api/v1/activities/{id}` | Get activity by ID |
| `PATCH` | `/api/v1/activities/{id}` | Update activity (owner only) |
| `DELETE` | `/api/v1/activities/{id}` | Delete activity (owner only) |
| `GET` | `/api/v1/activities` | List the caller's own activities (filters: activity_type, status, limit, offset) |
| `GET` | `/api/v1/map/activities` | Activity tracks as GeoJSON FeatureCollection (public, `?bbox=w,s,e,n&zoom=z&limit=200`, `visibility='public'` only) |

### 8. Wiring in main.go — `apps/api/cmd/server/main.go`

- [ ] Construct activity repo/service/handler (no S3 in 4a)
- [ ] Register routes (authenticated group + public map endpoint)

```go
// Activities
activityRepo := activity.NewRepository(pool)
activityService := activity.NewService(activityRepo)
activityHandler := activity.NewHandler(activityService)

// Authenticated routes
r.With(middleware.MaxBody(50 << 20)).Post("/api/v1/activities", activityHandler.CreateActivity)
r.Get("/api/v1/activities/{id}", activityHandler.GetActivity)
r.Patch("/api/v1/activities/{id}", activityHandler.UpdateActivity)
r.Delete("/api/v1/activities/{id}", activityHandler.DeleteActivity)
r.Get("/api/v1/activities", activityHandler.ListMyActivities)

// Public
r.Get("/api/v1/map/activities", activityHandler.GetMapActivities)
```

### 9. Shared types — `packages/shared/src/types/activity.ts`

- [ ] Create Activity, ActivityPhoto, UploadURLResponse types, and the `ACTIVITY_TYPE_FIELDS` config

```typescript
export type ActivityType =
  | 'ski' | 'backcountry_ski' | 'snowboard' | 'trail_run'
  | 'hike' | 'climb' | 'boulder' | 'alpinism' | 'bike' | 'other'

export type Visibility = 'private' | 'followers' | 'public'
export type ActivityStatus = 'draft' | 'published'

export interface Activity {
  id: string
  user_id: string
  title: string
  description: string | null
  activity_type: ActivityType
  started_at: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  duration_s: number | null
  metrics: Record<string, number | string> | null
  original_file_url: string | null
  original_file_format: 'gpx' | 'fit' | null
  cover_photo_url: string | null
  visibility: Visibility
  status: ActivityStatus
  source: string
  source_id: string | null
  route_id: string | null
  created_at: string
  updated_at: string
}

export interface ActivityPhoto {
  id: string
  activity_id: string
  key: string              // S3 object key, e.g. "photos/{activity_id}/{uuid}.jpg"
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

- [ ] `ACTIVITY_TYPE_FIELDS` — a per-`ActivityType` definition of the extra fields the manual-entry form should show (stored into `metrics`). Drives the activity-type-aware form. Example: `ski`/`backcountry_ski`/`snowboard` → `vertical_descent_m`, `run_count`; `trail_run`/`hike` → `avg_pace`, `avg_hr`; `bike` → `avg_power`; all types → `calories`, `perceived_effort`.
- [ ] Export from `packages/shared/src/index.ts`

### 10. Go dependency

- [ ] No new Go dependencies in 4a (GPX parser uses stdlib `encoding/xml`; `minio-go` deferred to 4c)

### 4a Verification Checklist

- [ ] Migration 003 creates the `activities` table with all PostGIS indexes
- [ ] GPX parser unit tests pass (valid, multi-segment, empty, malformed)
- [ ] `POST /api/v1/activities` with multipart GPX file creates an activity with computed stats + `track` + `started_at`, `source='gpx'`
- [ ] `POST /api/v1/activities` with metadata only (no GPX) creates a manual activity, `track` NULL, `source='manual'`
- [ ] Submitted fields override GPX-parsed values
- [ ] `GET /api/v1/activities/{id}` returns activity JSON
- [ ] `PATCH /api/v1/activities/{id}` updates title/description/activity_type/visibility (owner only)
- [ ] `DELETE /api/v1/activities/{id}` deletes activity (owner only, returns 204)
- [ ] `GET /api/v1/map/activities?bbox=...&zoom=10` returns a GeoJSON FeatureCollection with simplified geometries, `visibility='public'` only
- [ ] Feature cap: limit=200 default, max=500
- [ ] Non-owner gets 403 on update/delete
- [ ] Invalid activity type returns 422

---

## Sub-milestone 4b — Activity Tracks on Map + Activity UI

**Goal**: Activity tracks appear as colored lines on the main map. Users can create activities via the web UI (form + optional GPX) and view activity detail pages.

### 1. Activity store — `apps/web/src/stores/activityStore.ts`

- [ ] Create Zustand store

```typescript
interface ActivityState {
  mapActivitiesGeoJSON: GeoJSON.FeatureCollection | null
  isLoadingMapActivities: boolean
  activeActivity: Activity | null
  activeActivityPhotos: ActivityPhoto[]
  myActivities: Activity[]
  myActivitiesTotal: number

  fetchMapActivities: (bbox: [number, number, number, number], zoom: number) => Promise<void>
  fetchActivity: (id: string) => Promise<void>
  fetchMyActivities: (offset?: number) => Promise<void>
  createActivity: (data: FormData) => Promise<Activity>
  updateActivity: (id: string, fields: Partial<Activity>) => Promise<void>
  deleteActivity: (id: string) => Promise<void>
  setActiveActivity: (activity: Activity | null) => void
  clearActiveActivity: () => void
}
```

### 2. Activity tracks hook — `apps/web/src/map/runtime/shared/activityTracks.ts`

- [ ] Create `useActivityTracks(adapter)` hook targeting `AppMapAdapter` (follows `useRasterOverlays` pattern)

Responsibilities:
- On `moveend` (via `adapter.onMoveEnd`, debounced 500ms), get viewport bounds via `adapter.getBounds()` and zoom via `adapter.getZoom()`, call `activityStore.fetchMapActivities(bbox, zoom)`
- Add a GeoJSON source + `line` layer (color by activity type) + `circle` layer (start points) via `adapter.addSource`/`adapter.addLayer`, passing `{ slot: 'top' }` to `addLayer` so tracks draw above the basemap and topo rasters (M3 slot contract — the MapTiler adapter maps the slot to a `beforeId`)
- Click handler on the line layer via `adapter.onClick`: extract `id`, call `activityStore.fetchActivity(id)`, open the detail panel
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

- [ ] Wire `useActivityTracks(adapter)` in both `runtime/mapbox/MapContainer.tsx` and `runtime/maptiler/MapContainer.tsx` (adapter wraps the provider map instance)

### 4. Capability matrix — `packages/map-core/src/`

- [ ] Rename the `trip_routes` feature to `activity_tracks` in `providers.ts` (the `FeatureId` type) and `capabilities.ts`, and flip it from `coming_soon` to `available` for both providers — activity tracks ship in this sub-milestone via the shared `AppMapAdapter`

### 5. Activity detail panel — `apps/web/src/map/ActivityDetailPanel.tsx`

- [ ] Slide-in panel (overlay on the map) showing:
  - Activity title, activity type badge, stats (distance, elevation, duration, `started_at`)
  - Mini elevation profile (simple SVG)
  - "View full detail" link to `/activities/:id`
  - Close button

### 6. Activity creation page — `apps/web/src/pages/ActivityCreatePage.tsx`

- [ ] Standalone page at `/activities/new` — the unified create flow:
  - **Optional** GPX file upload (drag-and-drop or file picker). If provided, parse client-side to pre-fill stats and preview the track
  - Title text input, description textarea
  - Activity type dropdown; **activity-type-aware fields** (driven by `ACTIVITY_TYPE_FIELDS`) for manual stats → `metrics`
  - `started_at` date/time picker, visibility selector, status selector
  - On success, redirect to `/activities/:id`

### 7. GPX uploader component — `apps/web/src/components/GpxUploader.tsx`

- [ ] Optional drag-and-drop `.gpx` file upload
  - Client-side validation: max 50MB, `.gpx` extension
  - Shows file name and size after selection
  - Preview track on a mini map (client-side GPX coordinate extraction); pre-fills the form's stat fields

### 8. Activity detail page — `apps/web/src/pages/ActivityDetailPage.tsx`

- [ ] Standalone page at `/activities/:id`:
  - Full-width map zoomed to fit the track bounds (NULL track → no map, stats only)
  - Stats bar: distance, elevation gain/loss, duration, `started_at`
  - Activity type badge, description
  - Photo gallery section (populated in Phase 4c)
  - Edit / Delete buttons (owner only)

### 9. Activity card component — `apps/web/src/components/ActivityCard.tsx`

- [ ] Compact activity preview for list views

### 10. Routing — `apps/web/src/App.tsx`

- [ ] Add lazy-loaded routes

```tsx
const ActivityCreatePage = lazy(() => import('./pages/ActivityCreatePage'))
const ActivityDetailPage = lazy(() => import('./pages/ActivityDetailPage'))

// In Routes:
<Route path="/activities/new" element={<Suspense ...><ActivityCreatePage /></Suspense>} />
<Route path="/activities/:id" element={<Suspense ...><ActivityDetailPage /></Suspense>} />
```

### 11. Layer registry — `packages/map-core/src/layers.ts`

- [ ] Add `activity-tracks` layer definition

```typescript
{
  id: 'activity-tracks',
  name: 'Activity Tracks',
  category: 'data',
  description: 'User-recorded activity tracks within viewport',
  phase: 4,
  available: true,
}
```

### 4b Verification Checklist

- [ ] Activity tracks appear as colored lines when browsing the map
- [ ] Tracks are fetched on viewport change (debounced)
- [ ] Clicking a track opens the activity detail panel
- [ ] `/activities/new` allows creation with an optional GPX upload, or manual entry with type-aware fields
- [ ] Activity creation succeeds and redirects to the detail page
- [ ] `/activities/:id` shows full activity detail with map (or stats-only for a manual activity) and stats
- [ ] Only the activity owner sees edit/delete controls
- [ ] Tracks re-appear after base style changes (style.load re-application works)
- [ ] The `activity_tracks` capability reads `available` for both providers

---

## Sub-milestone 4c — Photo Upload + Geotagging + Search Bar + Radix UI

**Goal**: S3 storage infrastructure, raw-file persistence, photo upload with geotagging, map search bar for geocoding, Radix UI for accessible dialogs and toasts. 4c does not block the activity MVP (4a + 4b).

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
- [ ] Create `storage.Client` wrapping `minio-go/v7`: `PresignedPutURL` (with content-length-range condition, max 20MB), `PresignedGetURL`, `GetObject`, `PutObject`, `DeleteObject`
- [ ] Wire S3 client into the activity service: `activityService.SetStorage(s3Client)` — the service operates without S3 for 4a/4b (GPX-only and manual activities still work)
- [ ] On activity create, persist the raw uploaded GPX to S3 (`gpx/{activity_id}.gpx`) and set `original_file_url` + `original_file_format = 'gpx'` — the raw file is kept as the source of truth (re-parseable, and the basis for future GPX/FIT export)
- [ ] Register `POST /api/v1/upload/url` endpoint (body: `{activity_id, file_ext, content_type}`). **Authenticated + verifies caller owns activity_id.** Server generates the key as `photos/{activity_id}/{uuid}.{ext}` — clients never choose keys — and records an **upload intent** in Redis (`upload_intent:{key}` → `activity_id`, 1-hour TTL). Returns `{url, key}`.

### 2. Migration 004: Activity photos table — `apps/api/migrations/004_activity_photos.{up,down}.sql`

- [ ] Create `004_activity_photos.up.sql`

```sql
CREATE TABLE activity_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    caption     TEXT,
    location    GEOGRAPHY(Point, 4326),
    taken_at    TIMESTAMPTZ,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_photos_activity_id ON activity_photos(activity_id);
```

- [ ] Create `004_activity_photos.down.sql`

```sql
DROP TABLE IF EXISTS activity_photos;
```

### 3. Photo model — `apps/api/internal/activity/photo.go`

- [ ] Create `Photo` struct

```go
type Photo struct {
    ID         string
    ActivityID string
    Key        string     // S3 object key (e.g. "photos/{activity_id}/{uuid}.jpg"), NOT an arbitrary URL
    Caption    *string
    Lat        *float64
    Lon        *float64
    TakenAt    *time.Time
    SortOrder  int
    CreatedAt  time.Time
}
```

- [ ] Add repository methods:
  - `CreatePhoto(ctx, p *Photo) (*Photo, error)` — INSERT with `ST_MakePoint($lon, $lat)::geography`
  - `ListPhotos(ctx, activityID string) ([]*Photo, error)` — ORDER BY sort_order
  - `DeletePhoto(ctx, photoID string) error`
  - `CountPhotos(ctx, activityID string) (int, error)` — for the 50-photo-per-activity limit

### 4. Photo geotagging — `apps/api/internal/activity/exif.go`

- [ ] Create EXIF GPS extraction + timestamp interpolation

```go
// ExtractPhotoLocation determines a photo's GPS coordinates.
// Resolution order:
// 1. EXIF GPS coordinates (if present and valid)
// 2. Timestamp interpolation against the activity's GPX track
// 3. nil, nil (no location)
func ExtractPhotoLocation(photoData []byte, trackpoints []Trackpoint) (lat, lon *float64, takenAt *time.Time, err error)

// interpolatePosition binary searches for bracketing trackpoints, linearly interpolates lat/lon.
func interpolatePosition(t time.Time, points []Trackpoint) (lat, lon float64, ok bool)
```

- [ ] Go dependency: `go get github.com/rwcarlsen/goexif/exif`

### 5. Photo handler endpoints

- [ ] Add to the activity handler:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/activities/{id}/photos` | Associate photo with activity (body: `{key, caption, sort_order}`). Server fetches the object from S3 by key, extracts EXIF GPS |
| `GET` | `/api/v1/activities/{id}/photos` | List activity photos |
| `DELETE` | `/api/v1/photos/{id}` | Delete photo |

> **SSRF guard**: The `key` is a server-generated S3 object key (e.g. `photos/{activity_id}/{uuid}.jpg`), never client-chosen. Before fetching from S3, `AddPhoto` (1) verifies the caller owns `activity_id`, (2) checks the key matches the prefix `photos/{activity_id}/`, and (3) consumes the matching `upload_intent:{key}` Redis record written by `POST /upload/url` — a key with no live intent is rejected. The random server-generated `{uuid}` makes keys unguessable; the intent record proves the key was issued to this caller (prefix validation alone cannot).

> **Photo validation** (in `AddPhoto` service method):
> 1. Validate the key prefix matches `photos/{activity_id}/` and consume a matching `upload_intent:{key}` Redis record (reject if absent)
> 2. Fetch object from S3, reject if >20 MB or missing
> 3. Validate magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`) — reject non-image files
> 4. Extract EXIF GPS / timestamp for geotagging
> 5. Store photo record. Thumbnail generation is deferred (out of scope for 4c MVP — serve originals initially)
> 6. On EXIF extraction failure: store photo without location (non-fatal), log warning

- [ ] Add service methods:
  - `AddPhoto(ctx, userID, activityID, key, caption string, sortOrder int) (*Photo, error)` — validates key prefix + magic bytes, checks ownership, 50-photo limit, fetches from S3, extracts EXIF, stores record
  - `ListPhotos(ctx, activityID string) ([]*Photo, error)`
  - `DeletePhoto(ctx, userID, photoID string) error`

### 6. EXIF tests — `apps/api/internal/activity/exif_test.go`

- [ ] Test EXIF extraction with sample JPEG bytes
- [ ] Test timestamp interpolation with known trackpoints

### 7. Map search bar — `apps/web/src/map/runtime/mapbox/MapSearch.tsx`

- [ ] `@mapbox/search-js-react` SearchBox component (Mapbox-specific — lives inside `runtime/mapbox/`)
  - **Scope**: map geocoder only ("fly to place"). Full app-level search (activities, users, areas) is Phase 10.
  - Positioned top-left of map
  - On result select, calls `map.flyTo({center, zoom})`
  - Uses existing `VITE_MAPBOX_ACCESS_TOKEN`
  - No backend changes — Mapbox Search Box API called directly from client
  - **Provider gating**: wrapped in a capability check; the MapTiler provider shows `Coming soon` (MapTiler geocoder ships in M4 — provider-specific features, deferred to after Phase 4)
  - Update the capability matrix: set the Mapbox `geocoder` feature to `available` when this ships

Frontend dependency: `@mapbox/search-js-react`

### 8. Radix UI primitives — `apps/web/src/components/ui/`

- [ ] `Dialog.tsx` — styled Radix Dialog (photo viewer, confirmation dialogs)
- [ ] `DropdownMenu.tsx` — styled Radix DropdownMenu (activity action menu)
- [ ] `Toast.tsx` — styled Radix Toast (upload success/error, CRUD feedback)
- [ ] `ToastProvider.tsx` — wraps the app with Radix ToastProvider (add to `App.tsx`)

Frontend dependencies:
```
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-toast
```

### 9. Photo gallery — `apps/web/src/components/PhotoGallery.tsx`

- [ ] Grid display of activity photos
  - Click opens a full-screen viewer via Radix Dialog
  - Shows photo location on a map if available

### 4c Verification Checklist

- [ ] The raw GPX file is persisted to S3 and `original_file_url`/`original_file_format` are set
- [ ] Photos can be uploaded to an activity via the pre-signed URL flow
- [ ] EXIF GPS coordinates are extracted and stored
- [ ] Photos without EXIF GPS get location via timestamp interpolation against the activity's GPX track
- [ ] Photos display in the activity detail page gallery
- [ ] 50-photo-per-activity limit enforced
- [ ] Search bar geocodes locations and flies the map to the result
- [ ] Radix Dialog, DropdownMenu, and Toast work correctly
- [ ] Toast notifications show on activity create/update/delete/photo upload

---

## Sub-milestone 4d — Climbing Activity Segments

**Goal**: Climbing activities can have approach/climb/descent segments with per-pitch metadata. Vertical elevation profile visualization.

### 1. Migration 005: Activity segments table — `apps/api/migrations/005_activity_segments.{up,down}.sql`

- [ ] Create `005_activity_segments.up.sql`

```sql
CREATE TABLE activity_segments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id      UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
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

CREATE INDEX idx_activity_segments_activity_id ON activity_segments(activity_id);
```

- [ ] Create `005_activity_segments.down.sql`

```sql
DROP TABLE IF EXISTS activity_segments;
```

### 2. Segment model — `apps/api/internal/segment/segment.go`

- [ ] Create `Segment` and `Pitch` structs

```go
package segment

type Segment struct {
    ID             string
    ActivityID     string
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
  - `ListByActivity(ctx, activityID string) ([]*Segment, error)` — ORDER BY segment_order
  - `Update(ctx, id string, fields UpdateFields) (*Segment, error)`
  - `Delete(ctx, id string) error`

### 4. Segment service — `apps/api/internal/segment/service.go`

- [ ] Methods:
  - `AddSegment(ctx, userID, activityID string, fields CreateFields) (*Segment, error)` — validates activity ownership, segment_type, and that the activity's `activity_type` is `"climb"` or `"alpinism"`
  - `ListSegments(ctx, activityID string) ([]*Segment, error)`
  - `UpdateSegment(ctx, userID, segmentID string, fields UpdateFields) (*Segment, error)`
  - `DeleteSegment(ctx, userID, segmentID string) error`

### 5. Segment handler — `apps/api/internal/segment/handler.go`

- [ ] Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/activities/{id}/segments` | Add segment to a climbing activity |
| `GET` | `/api/v1/activities/{id}/segments` | List activity segments |
| `PATCH` | `/api/v1/activity-segments/{id}` | Update segment |
| `DELETE` | `/api/v1/activity-segments/{id}` | Delete segment |

### 6. Wiring — `apps/api/cmd/server/main.go`

- [ ] Construct segment repo/service/handler and register routes

```go
segmentRepo := segment.NewRepository(pool)
segmentService := segment.NewService(segmentRepo, activityRepo)
segmentHandler := segment.NewHandler(segmentService)
```

### 7. Shared segment types — `packages/shared/src/types/activity.ts`

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

export interface ActivitySegment {
  id: string
  activity_id: string
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
  - Labels: pitch number and grade in the user's preferred system
  - Segments shown as labeled sections (approach → climb → descent)

Frontend dependency: `@openbeta/sandbag`

### 9. Segment editor — `apps/web/src/components/SegmentEditor.tsx`

- [ ] Activity detail page component (owner only):
  - Add segment button with type selector
  - Per-segment: elevation gain, duration, pitch count
  - Per-pitch form: grade inputs (multi-system), elevation, duration, belay type

### 10. Climbing-aware activity detail — `apps/web/src/pages/ActivityDetailPage.tsx`

- [ ] If `activity_type` is `"climb"` or `"alpinism"`, show the segments section + `ClimbingProfile`

### 4d Verification Checklist

- [ ] Can add approach/climb/descent segments to a climbing activity
- [ ] Cannot add segments to non-climbing activities (returns 422)
- [ ] Each climb segment supports per-pitch metadata
- [ ] Grades stored as multi-system JSONB
- [ ] `@openbeta/sandbag` converts and displays grades correctly
- [ ] Vertical elevation profile renders with pitch-by-pitch stacked bars
- [ ] Segment CRUD works with ownership checks
- [ ] Segment data persists correctly in the JSONB pitches column

---

## Testing Strategy

### Go backend

**Unit tests** (no database):
- `activity/gpx_test.go` — all GPX parsing scenarios
- `activity/exif_test.go` — EXIF extraction, timestamp interpolation
- `segment/service_test.go` — validation (invalid segment type, invalid activity type, ownership)

**Integration tests** (`//go:build integration`):
- `activity/repository_test.go` — follows `user/repository_test.go` pattern: Create + FindByID + FindByBBox + Delete
- PostGIS spatial queries: insert an activity with a known track, query by containing bbox (found) and non-containing bbox (empty)
- Photo creation with PostGIS Point geometry
- Segment CRUD with JSONB pitches

### Frontend

**Vitest unit tests**:
- `activityStore.test.ts` — store actions with a mocked API client

**Component tests** (React Testing Library):
- `GpxUploader` — drag-and-drop, file validation, size limit
- `ClimbingProfile` — rendering with known pitch data

### Test data

- `data/seed/activities.sql` — sample activity data with PostGIS geometries
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
- `apps/api/internal/activity/activity.go`
- `apps/api/internal/activity/gpx.go`
- `apps/api/internal/activity/gpx_test.go`
- `apps/api/internal/activity/repository.go`
- `apps/api/internal/activity/repository_test.go`
- `apps/api/internal/activity/service.go`
- `apps/api/internal/activity/handler.go`
- `apps/api/migrations/003_activities.up.sql`
- `apps/api/migrations/003_activities.down.sql`
- `packages/shared/src/types/activity.ts`

**Modified files (Phase 4a — 2):**
- `apps/api/cmd/server/main.go` — wire activity repo/service/handler
- `packages/shared/src/index.ts` — export activity types

**New files (Phase 4b — 7):**
- `apps/web/src/stores/activityStore.ts`
- `apps/web/src/map/runtime/shared/activityTracks.ts`
- `apps/web/src/map/ActivityDetailPanel.tsx`
- `apps/web/src/pages/ActivityCreatePage.tsx`
- `apps/web/src/pages/ActivityDetailPage.tsx`
- `apps/web/src/components/GpxUploader.tsx`
- `apps/web/src/components/ActivityCard.tsx`

**Modified files (Phase 4b — 6):**
- `apps/web/src/App.tsx` — add routes
- `apps/web/src/map/runtime/mapbox/MapContainer.tsx` — wire useActivityTracks hook
- `apps/web/src/map/runtime/maptiler/MapContainer.tsx` — wire useActivityTracks hook
- `packages/map-core/src/layers.ts` — add activity-tracks layer definition
- `packages/map-core/src/providers.ts` — rename `trip_routes` FeatureId → `activity_tracks`
- `packages/map-core/src/capabilities.ts` — `activity_tracks` → `available` for both providers

**New files (Phase 4c — 12):**
- `apps/api/internal/storage/s3.go`
- `apps/api/internal/activity/photo.go`
- `apps/api/internal/activity/exif.go`
- `apps/api/internal/activity/exif_test.go`
- `apps/api/migrations/004_activity_photos.up.sql`
- `apps/api/migrations/004_activity_photos.down.sql`
- `apps/web/src/map/runtime/mapbox/MapSearch.tsx`
- `apps/web/src/components/ui/Dialog.tsx`
- `apps/web/src/components/ui/DropdownMenu.tsx`
- `apps/web/src/components/ui/Toast.tsx`
- `apps/web/src/components/ui/ToastProvider.tsx`
- `apps/web/src/components/PhotoGallery.tsx`

**Modified files (Phase 4c — 9):**
- `apps/api/internal/config/config.go` — add S3 fields
- `apps/api/internal/activity/repository.go` — add photo methods
- `apps/api/internal/activity/service.go` — add photo methods + SetStorage + raw-file persistence
- `apps/api/internal/activity/handler.go` — add photo + upload-url endpoints
- `apps/api/cmd/server/main.go` — wire S3 client, register photo routes + upload-url
- `apps/api/go.mod` — add minio-go, goexif
- `docker-compose.yml` — add MinIO service
- `apps/web/src/map/runtime/mapbox/MapContainer.tsx` — add MapSearch (Mapbox provider only)
- `apps/web/src/App.tsx` — add ToastProvider wrapper
- `apps/web/src/pages/ActivityDetailPage.tsx` — add photo gallery
- `apps/web/package.json` — add search-js, radix dependencies

**New files (Phase 4d — 8):**
- `apps/api/internal/segment/segment.go`
- `apps/api/internal/segment/repository.go`
- `apps/api/internal/segment/service.go`
- `apps/api/internal/segment/handler.go`
- `apps/api/migrations/005_activity_segments.up.sql`
- `apps/api/migrations/005_activity_segments.down.sql`
- `apps/web/src/components/ClimbingProfile.tsx`
- `apps/web/src/components/SegmentEditor.tsx`

**Modified files (Phase 4d — 5):**
- `apps/api/cmd/server/main.go` — wire segment handler
- `packages/shared/src/types/activity.ts` — add segment types
- `apps/web/src/pages/ActivityDetailPage.tsx` — add climbing sections
- `apps/web/src/stores/activityStore.ts` — add segment state/actions
- `apps/web/package.json` — add @openbeta/sandbag

---

### Critical Reference Files

- `apps/api/internal/user/repository.go` — reference pattern for all new repository files (SQL const, COALESCE updates, pgx scanning, sentinel errors)
- `apps/api/cmd/server/main.go` — wiring point for all new handlers/services/repos
- `apps/web/src/map/runtime/shared/rasterOverlays.ts` — exact pattern to follow for `activityTracks` (AppMapAdapter usage, style.load handling)
- `apps/web/src/map/runtime/shared/mapAdapter.ts` — the `AppMapAdapter` interface that `activityTracks` targets
- `docs/Architecture.md` → **Database Design** section — authoritative `activities`, `activity_photos`, and `activity_segments` schemas; **Climbing Activity Model** subsection for segments