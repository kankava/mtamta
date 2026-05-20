# mtamta — Database Reference

> Full DDL for every table the platform uses or will use. The architectural framing — why PostgreSQL + PostGIS + TimescaleDB, retention rules, the modular-monolith boundary around the schema — lives in [`Architecture.md` → Data Model](Architecture.md#data-model). Phase docs (e.g. [`Phase4.md`](Phase4.md)) own the user-facing flows that the schemas underpin.

The database is **PostgreSQL 17** with the **PostGIS** and **TimescaleDB** extensions. Time-series tables (`weather_observations`, `wind_observations`, `snow_observations`) start as regular tables; `create_hypertable()` is a one-line migration when data volume justifies it.

All spatial columns use `GEOGRAPHY` (not `GEOMETRY`) so distance/length functions return meters by default. Coordinates are SRID 4326.

Migrations live in `apps/api/migrations/*.up.sql` and are applied on every API startup via `migrate.Up()` (see [`Deployment.md` → Database migrations](Deployment.md#database-migrations)).

---

## Auth

Owned by Phase 1 (Foundation). Auth flow described in [`Architecture.md` → Authentication Architecture](Architecture.md#authentication-architecture).

```sql
-- Extensions (required — timescaledb-ha image includes but does not auto-enable)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Core user record (provider-agnostic)
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  TEXT NOT NULL,
    email         TEXT UNIQUE,
    avatar_url    TEXT,
    bio           TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

-- OAuth provider links (Google, Apple)
CREATE TABLE auth_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,  -- 'google' | 'apple'
    provider_uid  TEXT NOT NULL,  -- 'sub' claim from ID token
    email         TEXT,
    refresh_token TEXT,           -- provider's refresh token (if needed)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_uid)
);

-- Future: email + password authentication
-- CREATE TABLE credentials (
--     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     password_hash TEXT NOT NULL,  -- bcrypt
--     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
```

Refresh tokens are **not** stored in Postgres — they live in Redis under `session:{sha256hex(token)}` with a 30-day TTL. Deleting the Redis entry revokes the session.

---

## Activities

Owned by Phase 4 (Activity System). See [`Phase4.md`](Phase4.md) for the upload/parse flow and the activity store on the frontend.

```sql
-- Activities (recorded outings — GPX upload now, device sync in Phase 5)
CREATE TABLE activities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    title         TEXT NOT NULL,
    description   TEXT,
    activity_type TEXT NOT NULL,  -- 'ski', 'backcountry_ski', 'trail_run', 'climb', etc.
    track         GEOGRAPHY(LineString, 4326),  -- recorded GPS path; NULL for a manual activity
    started_at    TIMESTAMPTZ,                  -- when the activity occurred (vs created_at = record creation)
    distance_m    FLOAT,
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s    INTEGER,
    start_point   GEOGRAPHY(Point, 4326),
    end_point     GEOGRAPHY(Point, 4326),
    metrics       JSONB,   -- activity-type-specific + device-rich stats (avg_hr, power, vertical_descent_m, ...)
    original_file_url    TEXT,  -- raw uploaded/synced file in S3, kept as source of truth
    original_file_format TEXT,  -- 'gpx' | 'fit'
    cover_photo_url TEXT,
    visibility    TEXT NOT NULL DEFAULT 'public',     -- 'private' | 'followers' | 'public'
    status        TEXT NOT NULL DEFAULT 'published',  -- 'draft' | 'published'
    source        TEXT NOT NULL DEFAULT 'manual',     -- 'manual' | 'gpx' | 'garmin' | 'coros' | ...
    source_id     TEXT,                               -- '{provider}:{activity_id}' for sync dedup
    route_id      UUID,  -- optional link to the planned route followed; FK added with the routes migration
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_track ON activities USING GIST(track);
CREATE INDEX idx_activities_start_point ON activities USING GIST(start_point);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_user_id ON activities(user_id, started_at DESC NULLS LAST);
CREATE INDEX idx_activities_status ON activities(status) WHERE status != 'published';
```

**Canonical activity types**: `ski`, `backcountry_ski`, `snowboard`, `trail_run`, `hike`, `climb`, `boulder`, `alpinism`, `bike`, `other`. Validated at the application layer.

**Activity provenance**: the device-sync columns (`source`, `source_id`, `original_file_url`, `original_file_format`) are part of the base table from migration 003 — no Phase 5 `ALTER` needed. `source_id` holds `'{provider}:{activity_id}'` for sync deduplication.

> **Climbing activities**: for `climb` and `alpinism`, the primary `track` may be unreliable (GPS multipath on vertical walls). Structured detail lives in `activity_segments` (below), where each segment carries pitch-level JSONB. The `track` still stores whatever GPS path is available for the map.

```sql
-- Activity Photos
CREATE TABLE activity_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,  -- S3 object key (e.g. 'photos/{activity_id}/{uuid}.jpg')
    caption     TEXT,
    location    GEOGRAPHY(Point, 4326),
    taken_at    TIMESTAMPTZ,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_photos_activity_id ON activity_photos(activity_id);
```

---

## Routes

Owned by Phase 6 (Route & Planning). Distinct from `activities` — these are **planned itineraries**, not recordings.

```sql
CREATE TABLE routes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    title         TEXT NOT NULL,
    description   TEXT,
    activity_type TEXT NOT NULL,                -- a route is planned with an activity in mind
    path          GEOGRAPHY(LineString, 4326),  -- planned / snapped line
    waypoints     JSONB,                        -- ordered input waypoints [{lng, lat}, ...]
    distance_m    FLOAT,
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    visibility    TEXT NOT NULL DEFAULT 'public',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_routes_path ON routes USING GIST(path);
CREATE INDEX idx_routes_user_id ON routes(user_id);
```

The `activities.route_id` foreign key is added with this migration so a recorded activity can reference the route it followed.

---

## Social & Notifications

Owned by Phase 9 (User & Social).

```sql
-- Follows
CREATE TABLE follows (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id)
);

-- Likes
CREATE TABLE activity_likes (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_id)
);

-- Saves (bookmarks)
CREATE TABLE activity_saves (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_id)
);

-- Comments
CREATE TABLE comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications (in-app inbox; push + email deferred to post-launch)
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,       -- 'follow', 'like', 'comment'
    payload    JSONB NOT NULL,
    read       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
```

---

## Locations

Owned by Phase 11 (Search & Discovery) for seeding from OpenSkiData / OSM / OpenBeta. Crags share this table (`type='crag'`) so climbing routes can reference them via `crag_id` without a separate table for crag location.

```sql
CREATE TABLE locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    region      TEXT,
    country     TEXT,
    type        TEXT NOT NULL,  -- 'resort', 'peak', 'trailhead', 'town', 'hut', 'crag'
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    elevation_m FLOAT,
    source      TEXT,           -- 'openskidata', 'osm', 'manual', 'openbeta'
    source_id   TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_locations_geo ON locations USING GIST(location);
CREATE INDEX idx_locations_type ON locations(type);
```

> **Crag-specific metadata** (stored in `metadata` JSONB for `type='crag'`): `wall_orientation` (compass bearing), `rock_type` (limestone/granite/sandstone/gneiss), `approach_description`, `approach_time_min`, `route_count` (denormalized), `altitude_m`, `season` (recommended months).

---

## Device Integrations

Owned by Phase 5 (Device Integrations). Token encryption uses AES-256-GCM with the key derived from `INTEGRATION_TOKEN_KEY`; see [`Architecture.md` → Device Integrations](Architecture.md#device-integrations).

```sql
-- OAuth credentials for connected devices
CREATE TABLE device_providers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL,          -- 'garmin', 'coros', etc.
    provider_uid     TEXT,                   -- User's ID at provider
    access_token     BYTEA NOT NULL,         -- AES-GCM encrypted
    refresh_token    BYTEA NOT NULL,         -- AES-GCM encrypted
    token_expires_at TIMESTAMPTZ NOT NULL,
    last_sync_at     TIMESTAMPTZ,
    sync_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Tracks which provider activities map to which local activities
CREATE TABLE synced_activities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_provider_id   UUID NOT NULL REFERENCES device_providers(id) ON DELETE CASCADE,
    provider_activity_id TEXT NOT NULL,
    activity_id          UUID REFERENCES activities(id) ON DELETE SET NULL,
    fit_file_url         TEXT,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status          TEXT NOT NULL DEFAULT 'success', -- success/failed/skipped
    error_message        TEXT,
    UNIQUE(device_provider_id, provider_activity_id)
);
```

---

## Climbing

Owned by Phase 12 (Advanced Features). `crag_id` references `locations(id)` where `type='crag'`.

```sql
-- Activity segments (approach/climb/descent phases for climbing activities)
CREATE TABLE activity_segments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    segment_type  TEXT NOT NULL,  -- 'approach', 'climb', 'descent'
    segment_order INTEGER NOT NULL,
    track         GEOGRAPHY(LineString, 4326),
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s    INTEGER,
    pitches       JSONB,  -- [{number, grade: {yds, french, uiaa}, elevation_m, duration_s, belay_type}]
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_segments_activity_id ON activity_segments(activity_id);

-- Climbing routes at a crag
CREATE TABLE climbing_routes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id       UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    grades        JSONB NOT NULL,  -- { yds: "5.10a", french: "6a+", uiaa: "VI+" }
    route_type    TEXT NOT NULL,   -- 'sport', 'trad', 'boulder', 'aid', 'ice', 'mixed', 'alpine'
    pitches       JSONB,           -- [{number, grade: {yds, french, uiaa}, length_m, description}]
    description   TEXT,
    first_ascent  TEXT,
    protection    TEXT,
    source        TEXT,            -- 'manual', 'openbeta'
    source_id     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_climbing_routes_crag_id ON climbing_routes(crag_id);
CREATE INDEX idx_climbing_routes_route_type ON climbing_routes(route_type);

-- Photo topos for a crag
CREATE TABLE crag_topos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    photo_url       TEXT NOT NULL,
    photo_width     INTEGER NOT NULL,
    photo_height    INTEGER NOT NULL,
    route_overlays  JSONB NOT NULL,  -- [{route_id, path: "M0.1,0.2 L0.3,0.4...", color, label}]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_crag_topos_crag_id ON crag_topos(crag_id);

-- 3D crag models (Tier 3 — experimental, no committed phase)
CREATE TABLE crag_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    model_url       TEXT NOT NULL,    -- glTF file URL
    pointcloud_url  TEXT,             -- Potree point cloud URL
    bounds          GEOGRAPHY(Polygon, 4326),
    transform       JSONB,            -- Position/rotation/scale for Mapbox placement
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_crag_models_crag_id ON crag_models(crag_id);
```

**Grade storage**: grades are stored as multi-system JSONB (`{ yds: "5.10a", french: "6a+", uiaa: "VI+" }`). The backend is a dumb store — it accepts and returns whatever grade systems the client provides. Frontend uses `@openbeta/sandbag` for conversion and comparison.

**SVG overlay coordinates**: `crag_topos.route_overlays` paths use normalized 0–1 coordinates relative to photo dimensions so overlays scale with display size. Example: `"M0.12,0.85 C0.15,0.60 0.20,0.40 0.25,0.15"`.

**3D rendering**: `crag_models.transform` (position lng/lat/altitude, rotation, scale) is consumed by Threebox's `CustomLayerInterface` for placement; Potree handles large point clouds.

---

## Live Data (Time-Series)

Owned by Phase 10 (Live Data Integrations). Regular PostgreSQL tables today; convert to TimescaleDB hypertables when row volume actually justifies it (no schema change beyond the one-line `create_hypertable` call).

```sql
CREATE TABLE weather_observations (
    time        TIMESTAMPTZ NOT NULL,
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    station_id  TEXT,
    temperature FLOAT,
    humidity    FLOAT,
    pressure    FLOAT,
    precip_mm   FLOAT,
    visibility  FLOAT,
    cloud_cover FLOAT
);
-- SELECT create_hypertable('weather_observations', 'time');

CREATE TABLE wind_observations (
    time       TIMESTAMPTZ NOT NULL,
    location   GEOGRAPHY(Point, 4326) NOT NULL,
    station_id TEXT,
    speed_ms   FLOAT,
    direction  FLOAT,
    gust_ms    FLOAT
);
-- SELECT create_hypertable('wind_observations', 'time');

CREATE TABLE snow_observations (
    time     TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    depth_cm FLOAT,
    new_cm   FLOAT
);
-- SELECT create_hypertable('snow_observations', 'time');

CREATE TABLE avalanche_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source        TEXT NOT NULL,       -- 'avalanche_org', 'slf', 'albina'
    region_id     TEXT NOT NULL,
    danger_level  INTEGER NOT NULL,    -- 1-5
    danger_zones  GEOGRAPHY(MultiPolygon, 4326),
    problems      JSONB,               -- [{type, aspects, elevations}]
    bulletin_text TEXT,
    published_at  TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ,
    raw_data      JSONB,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, region_id, published_at)
);

CREATE TABLE lift_status (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resort_id  TEXT NOT NULL,
    source     TEXT NOT NULL,          -- 'liftie', 'scraper'
    lift_name  TEXT NOT NULL,
    status     TEXT NOT NULL,          -- 'open', 'closed', 'hold', 'scheduled'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resort_id, lift_name)
);
```

---

## Pipeline Health

```sql
-- Tracks every ingest pipeline run for observability
CREATE TABLE pipeline_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline      TEXT NOT NULL,        -- 'weather', 'avalanche', 'lifts', 'device_sync', ...
    status        TEXT NOT NULL,        -- 'success', 'failed', 'running'
    started_at    TIMESTAMPTZ NOT NULL,
    finished_at   TIMESTAMPTZ,
    duration_ms   INTEGER,
    rows_affected INTEGER,
    error_message TEXT,
    metadata      JSONB                 -- pipeline-specific context (region, provider, ...)
);
CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs(pipeline, started_at DESC);
```

Powers the `GET /api/v1/admin/pipelines` dashboard. Retention: 30 days, weekly prune query. At ~100 runs/day this table stays small.

---

## Data Retention & Deletion

**User deletion** — soft delete via `users.deleted_at`. On delete: `display_name → "Deleted User"`, `bio` / `avatar_url` / `email` cleared, activities kept as "by deleted user" unless the user requests full data removal. GDPR export: `GET /api/v1/users/me/export` returns a JSON dump of all of the caller's data.

**Activity deletion** — hard delete via `ON DELETE CASCADE` (photos, segments, likes, comments, saves, comments all removed).

**Time-bounded cleanup** (scheduled prunes):

| Data | Retention | Method |
|---|---|---|
| `notifications` | 90 days | Auto-delete via scheduled cleanup |
| `pipeline_runs` | 30 days | Weekly prune query |
| `weather_observations` | 90 days | Drop old rows; continuous aggregates can retain summaries once hypertables are enabled |
| `wind_observations` | 90 days | As weather |
| `snow_observations` | 90 days | As weather |

---

## Redis Keys

Redis is not a primary store — it holds session lookups, rate-limit counters, sync locks, OAuth state, and proxied-tile caches. Restarting Redis loses cache and forces every user to re-sign-in; everything else rebuilds from Postgres.

| Key Pattern | Purpose | TTL |
|---|---|---|
| `session:{sha256hex(refresh_token)}` | Refresh-token → user_id lookup; deleting the entry revokes the session | 30 days |
| `rate_limit:{ip}` | Per-IP rate-limit counter | 1 minute |
| `{provider.cache_prefix}:{z}:{x}:{y}` | Proxied country-topo tile bytes. Current prefixes: `tile:swisstopo` (24h), `tile:swisstopo-w` (24h), `tile:otm` (24h) | Per-provider (24h today) |
| `sentinel:{season}:{year}:{z}:{x}:{y}` | Seasonal Sentinel-2 tiles (gated on `SENTINEL_HUB_INSTANCE_ID`) | 7 days |
| `weather:{lat}:{lon}` | Current weather at a location | 15 minutes |
| `lift_status:{resort_id}` | Current lift statuses for a resort | 5 minutes |
| `integration:sync_lock:{user_id}:{provider}` | Prevents concurrent device syncs and enforces the 1-per-5-min manual-sync rate limit | 10 minutes |
| `integration:oauth_state:{state}` | OAuth PKCE state + code_verifier during the device-link flow | 5 minutes |
| `crags:bbox:{hash}` | Crag locations within a bounding box | 15 minutes |
| `webcam:{lat}:{lon}` | Nearby webcam thumbnails + metadata | 10 minutes |
| `directions:{sha256(waypoints)}` | Cached Mapbox Directions response | 1 hour |
