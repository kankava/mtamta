# mtamta — HTTP API Reference

> Per-endpoint catalogue. API-wide conventions (versioning, auth, error format, pagination, rate limits, CORS, file-upload limits) live in [`Architecture.md` → API Design & Conventions](Architecture.md#api-design--conventions).

All paths are under `/api/v1`. JSON request/response bodies, bearer-token auth via the `Authorization` header except where noted (e.g. the public map and tile endpoints accept anonymous traffic; refresh / logout read the `refresh_token` cookie).

**Status legend.** Each table starts with a status — *Shipped* (mounted in `cmd/server/main.go` today), *Planned (Phase N)* (designed here, built when its phase lands), or *Designed, gated* (handler exists but disabled in production until configuration is supplied, e.g. Sentinel Hub).

---

## System

*Shipped.*

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check. Reports the status of every configured dependency (`postgres`, `redis`; `meilisearch` only when `MEILI_URL` is set). `status: "ok"` when every checked service is healthy, `"degraded"` otherwise — unconfigured services are omitted, not failed. Used by Railway's deploy health check and Uptime Robot |
| `GET` | `/admin/pipelines` | Pipeline health dashboard — last run status per ingest pipeline. Admin-only (planned: Phase 10 with the live-data pipelines) |

---

## Auth

*Shipped.* See [`Architecture.md` → Authentication Architecture](Architecture.md#authentication-architecture) for the OAuth flow and token shape.

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/google` | Sign in with a Google ID token. Body `{id_token}`. Returns `{access_token, user}` plus a `refresh_token` `HttpOnly` cookie |
| `POST` | `/auth/apple` | Sign in with an Apple ID token. Same shape as `/auth/google` |
| `POST` | `/auth/refresh` | Issue a new access token using the `refresh_token` cookie. Returns `{access_token}` and re-issues the cookie |
| `POST` | `/auth/logout` | Invalidate the refresh token (Redis delete) and clear the cookie. 204 No Content |

Errors: `401 AUTH_FAILED` (invalid ID token / refresh token), `403 SIGNUP_DISABLED` (allow-listed sign-up only), `409 EMAIL_EXISTS` (email already linked to another provider). Anything else is logged and returns `500 INTERNAL` — a 401 must never mask an infrastructure failure.

---

## Users

*Shipped:* `GET /users/me`, `PATCH /users/me`. The rest are *Planned (Phase 9, User & Social)*.

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/me` | Get the current user's profile |
| `PATCH` | `/users/me` | Update the current user's profile (display_name, bio, avatar_url) |
| `GET` | `/users/:id` | Get a user by ID |
| `GET` | `/users/:id/activities` | List a user's activities (visibility-filtered for the caller) |
| `GET` | `/users/:id/followers` | List a user's followers |
| `GET` | `/users/:id/following` | List users this user follows |
| `GET` | `/users/me/export` | Export all of the caller's data as JSON (GDPR) |
| `DELETE` | `/users/me` | Soft-delete the caller's account (sets `deleted_at`, scrubs PII; activities are kept as "by deleted user" unless full removal is requested) |

---

## Activities

*Planned (Phase 4).* See [`Phase4.md`](Phase4.md) for the Activity model and storage flow.

| Method | Path | Description |
|---|---|---|
| `POST` | `/activities` | Create an activity. Multipart: metadata fields + an **optional** GPX file. A GPX pre-fills `track` + derived stats; without it, the activity is a manual entry |
| `GET` | `/activities/:id` | Get activity details |
| `PATCH` | `/activities/:id` | Update an activity (owner only) |
| `DELETE` | `/activities/:id` | Delete an activity (cascades to photos, segments, likes, comments) |
| `GET` | `/activities` | List the caller's own activities. Filters: `activity_type`, `status`. Paginated |
| `GET` | `/map/activities` | Activity tracks as a GeoJSON FeatureCollection. Query: `?bbox=w,s,e,n&zoom=z&limit=200`. **Public, no auth**, `visibility='public'` only. `zoom` controls `ST_Simplify` tolerance; `limit` defaults 200, max 500 |
| `POST` | `/activities/:id/photos` | Associate an uploaded photo with the activity. Body `{key, caption, sort_order}` — `key` is the S3 object key returned by `/upload/url`, validated against `photos/{activity_id}/` |
| `GET` | `/activities/:id/photos` | List the activity's photos |
| `DELETE` | `/photos/:id` | Delete a photo (cascades to S3) |
| `POST` | `/upload/url` | Request a pre-signed S3 upload URL. Body `{activity_id, file_ext, content_type}`. **Server generates the key** (clients never choose keys); response includes the URL and the future object key. Authenticated; verifies caller owns `activity_id` |
| `GET` | `/activities/trending` | Trending activities (Phase 9) |
| `GET` | `/activities/featured` | Featured activities (Phase 9) |

---

## Routes

*Planned (Phase 6, Route & Planning).* Planned itineraries (the `routes` table) — distinct from `/activities`, which are recorded outings.

| Method | Path | Description |
|---|---|---|
| `POST` | `/routes` | Create a planned route |
| `GET` | `/routes/:id` | Get a route |
| `PATCH` | `/routes/:id` | Update a route (owner only) |
| `DELETE` | `/routes/:id` | Delete a route (owner only) |
| `GET` | `/routes` | List the caller's own routes |
| `GET` | `/map/routes` | Public routes as a GeoJSON FeatureCollection. Query `?bbox=w,s,e,n` |
| `POST` | `/routes/directions` | Proxy the Mapbox Directions API (walking profile) for route snapping. Body `{waypoints: [{lng, lat}]}` (≤25); returns the snapped polyline + distance. Cached in Redis 1 hour by waypoint hash. Also listed under [Geo / Map](#geo--map) |

---

## Climbing

*Planned (Phase 12, Advanced Features).* See [`Database.md` → Climbing](Database.md#climbing) for the schema.

| Method | Path | Description |
|---|---|---|
| `GET` | `/crags` | List / search crags. Filters: `bbox`, `rock_type`, `route_count` (min) |
| `GET` | `/crags/:id` | Get crag details (rock_type, approach, route count, etc.) |
| `POST` | `/crags` | Create a crag |
| `PATCH` | `/crags/:id` | Update crag details |
| `GET` | `/crags/:id/routes` | List climbing routes at a crag |
| `POST` | `/crags/:id/routes` | Add a climbing route at a crag |
| `GET` | `/climbing-routes/:id` | Get climbing route details (grades, pitches, protection) |
| `PATCH` | `/climbing-routes/:id` | Update a climbing route |
| `DELETE` | `/climbing-routes/:id` | Delete a climbing route |
| `GET` | `/crags/:id/topos` | List photo topos for a crag |
| `POST` | `/crags/:id/topos` | Upload a topo photo + route overlay paths (normalized 0–1 coordinates) |
| `PATCH` | `/crag-topos/:id` | Update topo overlays |
| `DELETE` | `/crag-topos/:id` | Delete a topo |
| `POST` | `/activities/:id/segments` | Add approach/climb/descent segments to a climbing activity (with pitch-level JSONB) |
| `GET` | `/activities/:id/segments` | Get segments + pitch data for a climbing activity |
| `PATCH` | `/activity-segments/:id` | Update an activity segment |
| `DELETE` | `/activity-segments/:id` | Delete an activity segment |

---

## Social

*Planned (Phase 9, User & Social).*

| Method | Path | Description |
|---|---|---|
| `POST` | `/users/:id/follow` | Follow a user |
| `DELETE` | `/users/:id/follow` | Unfollow a user |
| `POST` | `/activities/:id/like` | Like an activity |
| `DELETE` | `/activities/:id/like` | Unlike an activity |
| `POST` | `/activities/:id/save` | Save / bookmark an activity |
| `DELETE` | `/activities/:id/save` | Unsave an activity |
| `GET` | `/activities/:id/comments` | List comments on an activity |
| `POST` | `/activities/:id/comments` | Add a comment |
| `DELETE` | `/comments/:id` | Delete a comment (author or activity owner) |
| `GET` | `/feed` | Activity feed for the current user (followed users + featured) |

---

## Notifications

*Planned (Phase 9).* Push notifications and email are deferred to post-launch — these endpoints feed only the in-app inbox.

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | Get the caller's notifications (most recent first, paginated) |
| `PATCH` | `/notifications/:id/read` | Mark a notification as read |

---

## Integrations

*Planned (Phase 5, Device Integrations).* See [`Architecture.md` → Device Integrations](Architecture.md#device-integrations) for the `Provider` interface and Garmin specifics.

| Method | Path | Description |
|---|---|---|
| `GET` | `/integrations/providers` | List available providers + the caller's connection status |
| `GET` | `/integrations/providers/:provider/auth` | Get the OAuth URL to connect a provider (server generates `state` + PKCE `code_verifier`, stored in Redis 5 min) |
| `POST` | `/integrations/providers/:provider/callback` | Exchange the OAuth code, encrypt the resulting tokens (AES-256-GCM, key derived from `INTEGRATION_TOKEN_KEY`), store in `device_providers` |
| `DELETE` | `/integrations/providers/:provider` | Disconnect a provider (deletes tokens and pauses sync) |
| `GET` | `/integrations/providers/:provider/status` | Sync status: last sync time, sync count, last error |
| `PATCH` | `/integrations/providers/:provider/settings` | Toggle auto-sync, change cadence |
| `POST` | `/integrations/providers/:provider/sync` | Manual sync. Rate-limited: 1 per 5 min per (user, provider), enforced via the Redis sync lock |
| `GET` | `/integrations/activities` | List synced activities (`synced_activities` join `activities`), paginated |
| `POST` | `/integrations/providers/:provider/courses` | Push a route to the user's device (Garmin Courses API) |

---

## Geo / Map

*Mixed status.* The tile proxy is shipped today; Sentinel is designed but gated on configuration; the rest are planned.

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/tiles/{provider}/{z}/{x}/{y}` | Shipped | Generic tile proxy. `{provider}` is a key in the registry built from config (currently `swisstopo`, `swisstopo-winter`, `opentopomap`). Caches in Redis with per-provider TTL; honours `BlankThreshold` so the swisstopo proxy can drop blank border tiles |
| `GET` | `/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024` | Designed, gated | Sentinel Hub seasonal-imagery proxy. Mounted only when `SENTINEL_HUB_INSTANCE_ID` is configured. See [`Architecture.md` → Seasonal Satellite Imagery](Architecture.md#seasonal-satellite-imagery) for the long-term plan (pre-rendered PMTiles on R2 instead of on-demand WMS) |
| `GET` | `/map/pois` | Phase 11 | POIs within a bounding box |
| `GET` | `/map/crags` | Phase 12 | Crag locations within a bounding box |
| `POST` | `/routes/directions` | Phase 6 | Mapbox Directions proxy (walking profile). Also listed under [Routes](#routes) |

> Activity tracks (the most-trafficked map endpoint) live under [Activities](#activities) as `GET /map/activities`, not here.

---

## Weather / Live Data

*Planned (Phase 10, Live Data Integrations).*

| Method | Path | Description |
|---|---|---|
| `GET` | `/weather` | Current weather for a location (Open-Meteo, 15-min cache) |
| `GET` | `/weather/forecast` | Forecast for a location |
| `GET` | `/wind` | Wind speed / direction / gusts for a location |
| `GET` | `/snow` | Snow depth for a location |
| `GET` | `/avalanche` | Avalanche danger zones for a region as GeoJSON (avalanche.org / SLF / ALBINA, normalized) |
| `GET` | `/avalanche/:region/detail` | Full avalanche bulletin: problem types, aspects, elevations, text, link to original source |
| `GET` | `/lifts` | Lift status for a resort (Liftie for US; EU scrapers as stretch goal) |

---

## Search

*Planned (Phase 11, Search & Discovery).* Meilisearch-backed; indexes seeded from Postgres.

| Method | Path | Description |
|---|---|---|
| `GET` | `/search` | Global search across activities, locations, users |
| `GET` | `/search/activities` | Search activities (filters: `activity_type`, `user_id`, `started_at`) |
| `GET` | `/search/locations` | Search locations (filters: `type`, `_geo` radius) |

---

## Storage

The canonical upload endpoint is `POST /upload/url` under [Activities](#activities) — pre-signed S3 URL flow for photos and other large files. GPX files are not pre-signed; they ride in the multipart body of `POST /activities` because they must be parsed before the activity row is created. See [`Architecture.md` → S3-Compatible Object Storage](Architecture.md#s3-compatible-object-storage) for the bucket layout and access model.
