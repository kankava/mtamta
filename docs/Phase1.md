# Phase 1: Foundation — Detailed Implementation Plan

> Ordered task checklist. Complete tasks top-to-bottom — each section depends on the ones before it. Each task maps to a concrete file to create or a command to run.

---

## Library Decisions

Resolving all "or" choices from `Plan.md`:

| Concern | Choice | Import path |
|---|---|---|
| HTTP router | chi | `github.com/go-chi/chi/v5` |
| CORS middleware | chi/cors | `github.com/go-chi/cors` |
| DB driver | pgx/v5 | `github.com/jackc/pgx/v5` |
| DB migrations | golang-migrate | `github.com/golang-migrate/migrate/v4` |
| JWT | golang-jwt/jwt | `github.com/golang-jwt/jwt/v5` |
| Redis client | go-redis | `github.com/redis/go-redis/v9` |
| UUID | google/uuid | `github.com/google/uuid` |
| Input validation | go-playground/validator | `github.com/go-playground/validator/v10` |
| Error tracking | sentry-go | `github.com/getsentry/sentry-go` |
| Go hot reload | air | `github.com/air-verse/air` (dev tool, not a dependency) |
| JS package manager | pnpm | pnpm v9+ |

**Go module path**: `github.com/kankava/mtamta`

---

## 1. Repository Bootstrap

- [x] Confirm git is initialized at repo root (`git init` if not)
- [x] Create `.gitignore` at root:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
tmp/
*.exe

# Environment
.env
.env.local
.env.*.local

# Go
apps/api/tmp/

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/settings.json

# Coverage
coverage/
*.out
```

- [x] Create `.editorconfig` at root:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.go]
indent_style = tab
indent_size = 4

[Makefile]
indent_style = tab
```

---

## 2. Monorepo Setup

### 2.1 Root `package.json`

- [x] Create `package.json` at root:

```json
{
  "name": "mtamta",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

### 2.2 `pnpm-workspace.yaml`

- [x] Create `pnpm-workspace.yaml` at root:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 2.3 `turbo.json`

- [x] Create `turbo.json` at root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "outputs": ["coverage/**"]
    }
  }
}
```

### 2.4 Root `tsconfig.base.json`

- [x] Create `tsconfig.base.json` at root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

### 2.5 Install root dev deps

- [x] Run at root: `pnpm install`

---

## 3. Shared Package (`packages/shared`)

Build before the web app so it can be referenced during scaffolding.

### 3.1 `packages/shared/package.json`

- [x] Create `packages/shared/package.json`:

```json
{
  "name": "@mtamta/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

### 3.2 `packages/shared/tsconfig.json`

- [x] Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

> `"DOM"` is required here even though `@mtamta/shared` is platform-agnostic: it provides the `fetch`, `Request`, `Response`, and `Headers` type definitions that `api/client.ts` uses. Without it `tsc --noEmit` fails. The DOM lib adds only types — it does not ship browser globals at runtime on mobile/server targets.

### 3.3 Types — `packages/shared/src/types/user.ts`

- [x] Create `packages/shared/src/types/user.ts`:

```typescript
// All fields use snake_case to match Go JSON tags — consistent across web and mobile.
export interface User {
  id: string
  display_name: string
  email: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string // ISO 8601 UTC
  updated_at: string
}
```

### 3.4 Types — `packages/shared/src/types/auth.ts`

- [x] Create `packages/shared/src/types/auth.ts`:

```typescript
import type { User } from './user'

// access_token matches Go JSON tags (snake_case).
// refresh_token is NOT in this response — it is set as an HttpOnly cookie by
// the server and never exposed to JavaScript on web. Mobile reads it from
// the response body via a separate mobile-specific endpoint in Phase 9.
// Returned by POST /api/v1/auth/google and /apple.
export interface AuthResponse {
  access_token: string
  user: User
}

// Returned by POST /api/v1/auth/refresh — access token only, no user.
// The client already has the user in memory; re-fetching on every silent
// renewal would add an unnecessary DB read.
export interface RefreshResponse {
  access_token: string
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
```

### 3.5 Token storage — `packages/shared/src/storage/tokens.ts`

- [x] Create `packages/shared/src/storage/tokens.ts`:

```typescript
// Access token storage interface — implemented differently per platform.
// Web: access token lives only in memory (Zustand state). The refresh token
//      is in an HttpOnly cookie managed by the browser — JS never touches it.
// Mobile (Phase 9): both tokens stored in Keychain/Keystore via
//      react-native-keychain or expo-secure-store.
export interface TokenStorage {
  getAccessToken: () => string | null
  setAccessToken: (t: string) => void
  clear: () => void
}

// Web implementation — in-memory only. Access token is lost on page refresh
// and silently restored by calling POST /api/v1/auth/refresh on app mount
// (the HttpOnly refresh cookie is sent automatically by the browser).
export function createInMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null
  return {
    getAccessToken: () => accessToken,
    setAccessToken: (t) => { accessToken = t },
    clear: () => { accessToken = null },
  }
}
```

### 3.6 API client — `packages/shared/src/api/client.ts`

- [x] Create `packages/shared/src/api/client.ts`:

The client is a factory so `baseURL` and token access are injected — no platform-specific env reads (`import.meta.env`) inside `@mtamta/shared`.

```typescript
import type { TokenStorage } from '../storage/tokens'
import type { ApiError } from '../types/auth'

export interface ApiClientOptions {
  baseURL: string
  tokenStorage: TokenStorage
  // Called after a 401 to attempt a silent refresh.
  // Return the new access token on success, null on failure.
  onRefresh: () => Promise<string | null>
  // Called when refresh fails — e.g. redirect to login.
  onAuthFailure: () => void
}

export interface ApiClient {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body?: unknown) => Promise<T>
  patch: <T>(path: string, body?: unknown) => Promise<T>
  del: (path: string) => Promise<void>
}

export function createApiClient(opts: ApiClientOptions): ApiClient
```

Behaviour:
- Attach `Authorization: Bearer <token>` from `opts.tokenStorage.getAccessToken()`
- On 401: call `opts.onRefresh()` once; if it returns a new token update storage and retry the original request; if it returns null call `opts.onAuthFailure()` and throw
- On non-2xx: parse body as `ApiError` and throw
- `credentials: 'include'` on every request so the HttpOnly refresh cookie is sent cross-origin

### 3.7 Barrel — `packages/shared/src/index.ts`

- [x] Create `packages/shared/src/index.ts`:

```typescript
export * from './types/user'
export * from './types/auth'
export * from './storage/tokens'
export * from './api/client'
```

> **Platform wiring** (done in the app layer, not in `@mtamta/shared`):
>
> Web (`apps/web/src/lib/api.ts`):
> ```typescript
> import { createApiClient, createInMemoryTokenStorage } from '@mtamta/shared'
> // NOTE: do NOT import authStore here — that creates a circular dependency.
> // authStore imports apiClient; apiClient must not import authStore.
> // Instead, expose setAuthCallbacks() and let authStore wire itself in.
>
> export const tokenStorage = createInMemoryTokenStorage()
>
> type AuthCallbacks = {
>   onRefresh: () => Promise<string | null>
>   onAuthFailure: () => void
> }
>
> let _auth: AuthCallbacks = {
>   onRefresh: () => Promise.resolve(null),
>   onAuthFailure: () => {},
> }
>
> /** Called once by authStore after it is created. Breaks the circular dep. */
> export function setAuthCallbacks(cb: AuthCallbacks): void {
>   _auth = cb
> }
>
> export const apiClient = createApiClient({
>   baseURL: import.meta.env.VITE_API_URL,
>   tokenStorage,
>   onRefresh: () => _auth.onRefresh(),
>   onAuthFailure: () => _auth.onAuthFailure(),
> })
> ```

---

## 4. Go Backend — Scaffold

### 4.1 Create directory tree

- [x] Create the following directories under `apps/api/`:

```
apps/api/
├── cmd/
│   └── server/
├── internal/
│   ├── auth/
│   ├── cache/
│   ├── config/
│   ├── db/
│   ├── health/
│   ├── middleware/
│   └── user/
└── migrations/
```

### 4.2 Initialize Go module

- [x] From `apps/api/`, run:

```bash
go mod init github.com/kankava/mtamta
```

### 4.3 Install Go dependencies

- [x] From `apps/api/`, run:

```bash
go get \
  github.com/go-chi/chi/v5 \
  github.com/go-chi/cors \
  github.com/golang-jwt/jwt/v5 \
  github.com/google/uuid \
  github.com/jackc/pgx/v5 \
  github.com/jackc/pgx/v5/pgxpool \
  github.com/redis/go-redis/v9 \
  github.com/golang-migrate/migrate/v4 \
  github.com/golang-migrate/migrate/v4/database/pgx/v5 \
  github.com/golang-migrate/migrate/v4/source/file \
  github.com/go-playground/validator/v10 \
  github.com/getsentry/sentry-go
```

### 4.4 `internal/config/config.go`

- [x] Create `apps/api/internal/config/config.go`:

```go
package config

import (
    "fmt"
    "os"
)

type Config struct {
    Env            string // "development" | "production"
    Port           string
    DatabaseURL    string
    RedisURL       string
    JWTSecret      string
    GoogleClientID string
    AppleClientID  string
    WebOrigin      string
    SentryDSN      string
}

func Load() *Config {
    cfg := &Config{
        Env:            getEnv("ENV", "development"),
        Port:           getEnv("PORT", "8080"),
        DatabaseURL:    require("DATABASE_URL"),
        RedisURL:       require("REDIS_URL"),
        JWTSecret:      require("JWT_SECRET"),
        GoogleClientID: require("GOOGLE_CLIENT_ID"),
        AppleClientID:  getEnv("APPLE_CLIENT_ID", ""),
        WebOrigin:      getEnv("WEB_ORIGIN", "http://localhost:5173"),
        SentryDSN:      getEnv("SENTRY_DSN", ""),
    }
    return cfg
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}

func require(key string) string {
    v := os.Getenv(key)
    if v == "" {
        panic(fmt.Sprintf("required environment variable %s is not set", key))
    }
    return v
}
```

---

## 5. Database

### 5.1 `docker-compose.yml` (root)

- [x] Create `docker-compose.yml` at root (Phase 1 services only; MinIO added in Phase 4, Meilisearch in Phase 10):

```yaml
services:
  postgres:
    image: timescale/timescaledb-ha:pg17
    environment:
      POSTGRES_DB: mtamta
      POSTGRES_USER: mtamta
      POSTGRES_PASSWORD: mtamta
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mtamta"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### 5.2 Initial migration — up

- [x] Create `apps/api/migrations/001_init.up.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

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

CREATE TABLE auth_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,       -- 'google' | 'apple'
    provider_uid  TEXT NOT NULL,       -- 'sub' claim from ID token
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_uid)
);
```

### 5.3 Initial migration — down

- [x] Create `apps/api/migrations/001_init.down.sql`:

```sql
DROP TABLE IF EXISTS auth_providers;
DROP TABLE IF EXISTS users;
```

### 5.4 DB connection pool — `internal/db/db.go`

- [x] Create `apps/api/internal/db/db.go`:

```go
package db

import (
    "context"

    "github.com/jackc/pgx/v5/pgxpool"
)

func New(ctx context.Context, databaseURL string) *pgxpool.Pool {
    cfg, err := pgxpool.ParseConfig(databaseURL)
    if err != nil {
        panic("invalid DATABASE_URL: " + err.Error())
    }
    cfg.MaxConns = 10
    cfg.MinConns = 2
    pool, err := pgxpool.NewWithConfig(ctx, cfg)
    if err != nil {
        panic("failed to connect to database: " + err.Error())
    }
    if err := pool.Ping(ctx); err != nil {
        panic("database ping failed: " + err.Error())
    }
    return pool
}
```

### 5.5 Redis client — `internal/cache/redis.go`

- [x] Create `apps/api/internal/cache/redis.go`:

```go
package cache

import (
    "context"

    "github.com/redis/go-redis/v9"
)

func New(redisURL string) *redis.Client {
    opts, err := redis.ParseURL(redisURL)
    if err != nil {
        panic("invalid REDIS_URL: " + err.Error())
    }
    client := redis.NewClient(opts)
    if err := client.Ping(context.Background()).Err(); err != nil {
        panic("redis ping failed: " + err.Error())
    }
    return client
}
```

---

## 6. Middleware

### 6.1 Context keys — `internal/middleware/keys.go`

- [x] Create `apps/api/internal/middleware/keys.go`:

Typed context keys to avoid collisions:

```go
package middleware

type contextKey string

const (
    requestIDKey contextKey = "request_id"
    userIDKey    contextKey = "user_id"
    emailKey     contextKey = "email"
)
```

Export accessor functions: `RequestIDFromContext`, `UserIDFromContext`, `EmailFromContext`.

### 6.2 Request ID — `internal/middleware/requestid.go`

- [x] Create `apps/api/internal/middleware/requestid.go`:

```go
// RequestID middleware:
// 1. Read X-Request-ID header; generate uuid.New().String() if absent
// 2. Store in context via requestIDKey
// 3. Set X-Request-ID on response
func RequestID(next http.Handler) http.Handler
```

### 6.3 Logging — `internal/middleware/logger.go`

- [x] Create `apps/api/internal/middleware/logger.go`:

```go
// Logger middleware logs one line per request after completion.
// Fields: request_id, method, path, status, duration_ms, user_id (if set).
// Uses slog.Default(). Handler in main.go sets JSON vs text based on ENV.
func Logger(next http.Handler) http.Handler
```

Requires a `responseWriter` wrapper that captures the status code:

```go
type responseWriter struct {
    http.ResponseWriter
    status int
    written bool
}
```

### 6.4 Recovery — `internal/middleware/recovery.go`

- [x] Create `apps/api/internal/middleware/recovery.go`:

```go
// Recovery catches panics, captures to Sentry with request_id and user_id
// from context, then writes a 500 JSON response:
// {"error":{"code":"SERVER_ERROR","message":"an unexpected error occurred"}}
func Recovery(next http.Handler) http.Handler
```

### 6.5 Auth — `internal/middleware/auth.go`

- [x] Create `apps/api/internal/middleware/auth.go`:

```go
// Authenticate validates the Bearer token from Authorization header.
// On success: stores user_id and email in context.
// On failure: writes 401 {"error":{"code":"UNAUTHORIZED","message":"..."}}
func Authenticate(jwtSecret string) func(http.Handler) http.Handler
```

Export `UserIDFromContext(ctx context.Context) string`.

---

## 7. Authentication

### 7.1 JWT — `internal/auth/jwt.go`

- [x] Create `apps/api/internal/auth/jwt.go`:

```go
type Claims struct {
    jwt.RegisteredClaims
    UserID string `json:"user_id"`
    Email  string `json:"email"`
}

// IssueAccessToken signs a 15-minute HS256 JWT.
func IssueAccessToken(userID, email, secret string) (string, error)

// IssueRefreshToken returns a cryptographically random 32-byte hex string.
// It is opaque — not a JWT.
func IssueRefreshToken() (string, error)

// ValidateAccessToken parses and validates the JWT. Returns claims or error.
func ValidateAccessToken(tokenString, secret string) (*Claims, error)
```

### 7.2 Google verifier — `internal/auth/google.go`

- [x] Create `apps/api/internal/auth/google.go`:

Define a `JWKSClient` interface so tests can inject a mock server without making real network calls:

```go
// JWKSClient fetches and caches JSON Web Key Sets.
// The real implementation hits the provider URL; tests inject a mock.
type JWKSClient interface {
    Keys(ctx context.Context) ([]JSONWebKey, error)
}

type GoogleVerifier struct {
    clientID string
    jwks     JWKSClient // injected; cached in-memory with 1h TTL
}

type GoogleClaims struct {
    Sub     string
    Email   string
    Name    string
    Picture string
}

// NewGoogleVerifier creates a verifier pointing at the real Google JWKS URL.
func NewGoogleVerifier(clientID string) *GoogleVerifier

// NewGoogleVerifierWithJWKS creates a verifier with a custom JWKS client
// (used in tests to point at an httptest.Server).
func NewGoogleVerifierWithJWKS(clientID string, jwks JWKSClient) *GoogleVerifier

// Verify validates the ID token:
//   - Finds key matching token's `kid`
//   - Verifies signature using only RS256 (reject other algorithms)
//   - Checks iss is "accounts.google.com" or "https://accounts.google.com"
//   - Checks aud matches clientID
//   - Checks exp is in the future
func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error)
```

JWKS URL: `https://www.googleapis.com/oauth2/v3/certs`

### 7.3 Apple verifier — `internal/auth/apple.go`

- [x] Create `apps/api/internal/auth/apple.go`:

Same pattern and interface as Google:

```go
type AppleVerifier struct {
    clientID string
    jwks     JWKSClient
}

type AppleClaims struct {
    Sub   string
    Email string // may be empty on subsequent logins
}

func NewAppleVerifier(clientID string) *AppleVerifier
func NewAppleVerifierWithJWKS(clientID string, jwks JWKSClient) *AppleVerifier

// Verify validates the Apple ID token (RS256 only):
//   - JWKS URL: https://appleid.apple.com/auth/keys
//   - iss: "https://appleid.apple.com"
func (v *AppleVerifier) Verify(ctx context.Context, idToken string) (*AppleClaims, error)
```

### 7.4 Auth repository — `internal/auth/repository.go`

- [x] Create `apps/api/internal/auth/repository.go`:

```go
type Repository struct {
    db    *pgxpool.Pool
    redis *redis.Client
}

// FindUserByProviderUID returns the user linked to this provider identity,
// or nil if not found.
func (r *Repository) FindUserByProviderUID(ctx context.Context, provider, providerUID string) (*user.User, error)

// CreateUserWithProvider inserts a new user and their auth_provider row in one tx.
func (r *Repository) CreateUserWithProvider(ctx context.Context, displayName, email, provider, providerUID string) (*user.User, error)

// Refresh token storage (Redis):
// Key: "session:{sha256(token)}"  Value: userID  TTL: 30 days
func (r *Repository) StoreRefreshToken(ctx context.Context, token, userID string) error
func (r *Repository) LookupRefreshToken(ctx context.Context, token string) (userID string, err error)
func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error
```

### 7.5 Auth service — `internal/auth/service.go`

- [x] Create `apps/api/internal/auth/service.go`:

```go
type Service struct {
    repo           *Repository
    jwtSecret      string
    googleVerifier *GoogleVerifier
    appleVerifier  *AppleVerifier
}

type AuthResult struct {
    AccessToken  string // returned in response body
    RefreshToken string // set as HttpOnly cookie by handler; not in response body
    User         *user.User
}

func (s *Service) SignInWithGoogle(ctx context.Context, idToken string) (*AuthResult, error)
func (s *Service) SignInWithApple(ctx context.Context, idToken string) (*AuthResult, error)
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error)
func (s *Service) Logout(ctx context.Context, refreshToken string) error
```

`SignInWithGoogle` logic:
1. `googleVerifier.Verify` → extract `sub`, `email`, `name`
2. `FindUserByProviderUID("google", sub)` → found → issue tokens
3. Not found → `CreateUserWithProvider(name, email, "google", sub)` → issue tokens
4. `IssueRefreshToken()` → `StoreRefreshToken(refreshToken, userID)` → return `AuthResult`

`Refresh` logic:
1. `LookupRefreshToken` → get userID (error → 401)
2. Fetch user by ID
3. Issue new access token only (refresh token unchanged — no rotation in Phase 1)

### 7.6 Auth handler — `internal/auth/handler.go`

- [x] Create `apps/api/internal/auth/handler.go`:

Request/response types:

```go
type signInRequest struct {
    IDToken string `json:"id_token" validate:"required"`
}

// authResponse is what the client receives in the JSON body.
// The refresh token is NOT here — it is set as an HttpOnly cookie.
type authResponse struct {
    AccessToken string   `json:"access_token"`
    User        *userJSON `json:"user"`
}

// userJSON is the API representation of a user.
// All fields are snake_case to match the shared TypeScript User type.
type userJSON struct {
    ID          string  `json:"id"`
    DisplayName string  `json:"display_name"`
    Email       *string `json:"email"`
    AvatarURL   *string `json:"avatar_url"`
    Bio         *string `json:"bio"`
    CreatedAt   string  `json:"created_at"`
    UpdatedAt   string  `json:"updated_at"`
}
```

Cookie helper — call after every successful sign-in or refresh:

```go
func setRefreshCookie(w http.ResponseWriter, token string, secure bool) {
    http.SetCookie(w, &http.Cookie{
        Name:     "refresh_token",
        Value:    token,
        HttpOnly: true,
        Secure:   secure,           // false in development, true in production
        SameSite: http.SameSiteLaxMode,
        Path:     "/api/v1/auth",   // cookie only sent to auth endpoints
        MaxAge:   30 * 24 * 60 * 60, // 30 days
    })
}

func clearRefreshCookie(w http.ResponseWriter) {
    http.SetCookie(w, &http.Cookie{
        Name:     "refresh_token",
        HttpOnly: true,
        Path:     "/api/v1/auth",
        MaxAge:   -1, // delete immediately
    })
}
```

Endpoints:
- `POST /api/v1/auth/google` → decode `signInRequest` → `service.SignInWithGoogle` → `setRefreshCookie` → 200 `authResponse` (with `user`)
- `POST /api/v1/auth/apple` → decode `signInRequest` → `service.SignInWithApple` → `setRefreshCookie` → 200 `authResponse` (with `user`)
- `POST /api/v1/auth/refresh` → read `r.Cookie("refresh_token")` (401 if missing) → `service.Refresh` → `setRefreshCookie` → 200 `refreshResponse` (access token only — no `user`)
- `POST /api/v1/auth/logout` → read `r.Cookie("refresh_token")` → `service.Logout` → `clearRefreshCookie` → 204

`refreshResponse` is a distinct Go type:

```go
type refreshResponse struct {
    AccessToken string `json:"access_token"`
}
```

> Sign-in returns `user` because the client needs it to populate the session on first login. Refresh does not — the client already has the user in memory (Zustand). Returning `user` from refresh would require an extra DB read on every silent token renewal, which happens every 15 minutes. Keep refresh lightweight.

Add `cfg.Env == "production"` as the `secure` flag. The `Handler` struct holds the config env string.

All handlers use a shared `writeJSON(w, status, v)` and `writeError(w, status, code, message)` helper.

> **CSRF**: `SameSite=Lax` prevents cross-site POST requests from sending the cookie. Add an `Origin` header check in the middleware for extra defence: reject requests where `Origin` is set and does not match `cfg.WebOrigin`.

---

## 8. User Module

### 8.1 User model — `internal/user/user.go`

- [x] Create `apps/api/internal/user/user.go`:

```go
type User struct {
    ID          string
    DisplayName string
    Email       *string
    AvatarURL   *string
    Bio         *string
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

### 8.2 User repository — `internal/user/repository.go`

- [x] Create `apps/api/internal/user/repository.go`:

```go
type Repository struct { db *pgxpool.Pool }

func (r *Repository) FindByID(ctx context.Context, id string) (*User, error)
func (r *Repository) Create(ctx context.Context, u *User) (*User, error)
func (r *Repository) Update(ctx context.Context, id string, fields UpdateFields) (*User, error)

type UpdateFields struct {
    DisplayName *string
    Bio         *string
    AvatarURL   *string
}
```

`FindByID` returns a sentinel `ErrNotFound` when no row matches (not a generic error). Use `pgx.ErrNoRows`.

### 8.3 User service — `internal/user/service.go`

- [x] Create `apps/api/internal/user/service.go`:

```go
type Service struct { repo *Repository }

func (s *Service) GetMe(ctx context.Context, userID string) (*User, error)
func (s *Service) UpdateMe(ctx context.Context, userID string, fields UpdateFields) (*User, error)
```

`UpdateMe` validation before calling repo:
- `DisplayName`: max 50 chars if set
- `Bio`: max 500 chars if set

### 8.4 User handler — `internal/user/handler.go`

- [x] Create `apps/api/internal/user/handler.go`:

```go
type updateMeRequest struct {
    DisplayName *string `json:"display_name"`
    Bio         *string `json:"bio"`
    AvatarURL   *string `json:"avatar_url"`
}
```

> JSON tags use snake_case to match the `User` type in `@mtamta/shared` and all other API response fields. The UI must use `user.display_name`, not `user.displayName`.

Endpoints (both require `middleware.Authenticate`):
- `GET /api/v1/users/me` → `middleware.UserIDFromContext` → `service.GetMe` → 200 user JSON
- `PATCH /api/v1/users/me` → decode `updateMeRequest` → `service.UpdateMe` → 200 user JSON

---

## 9. Health Check

- [x] Create `apps/api/internal/health/handler.go`:

```go
type Handler struct {
    db    *pgxpool.Pool
    redis *redis.Client
}

// Health handles GET /api/v1/health.
// Pings both dependencies; returns 200 if both ok, 503 if either down.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request)
```

Response shape:
```json
{
  "status": "ok",
  "services": {
    "postgres": "ok",
    "redis": "error"
  }
}
```

---

## 10. Migration CLI — `cmd/migrate/main.go`

- [x] Create `apps/api/cmd/migrate/main.go`:

A small standalone binary wrapping golang-migrate so `make db-migrate` and `make db-reset` work without installing an external tool:

```go
package main

import (
    "log"
    "os"

    "github.com/golang-migrate/migrate/v4"
    _ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
    _ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
    direction := "up"
    if len(os.Args) > 1 {
        direction = os.Args[1]
    }

    databaseURL := os.Getenv("DATABASE_URL")
    if databaseURL == "" {
        log.Fatal("DATABASE_URL is required")
    }

    m, err := migrate.New("file://migrations", databaseURL)
    if err != nil {
        log.Fatalf("failed to create migrator: %v", err)
    }
    defer m.Close()

    switch direction {
    case "up":
        if err := m.Up(); err != nil && err != migrate.ErrNoChange {
            log.Fatalf("migration up failed: %v", err)
        }
    case "down":
        if err := m.Down(); err != nil && err != migrate.ErrNoChange {
            log.Fatalf("migration down failed: %v", err)
        }
    default:
        log.Fatalf("unknown direction %q: use 'up' or 'down'", direction)
    }

    log.Printf("migrations %s: done", direction)
}
```

> Note: `main.go` uses `main` as the server entry point wires migrations at startup too (step 7 in section 11). `cmd/migrate` is used for the `make db-migrate` and `make db-reset` targets outside of the running server.

---

## 11. Main Server — `cmd/server/main.go`

- [x] Create `apps/api/cmd/server/main.go`:

Wire-up order:

```
1. cfg := config.Load()
2. Init slog (JSON handler if cfg.Env == "production", text otherwise)
3. sentry.Init(sentry.ClientOptions{Dsn: cfg.SentryDSN, Environment: cfg.Env})
4. ctx := context.Background()
5. pool := db.New(ctx, cfg.DatabaseURL)
6. redisClient := cache.New(cfg.RedisURL)
7. Run migrations (golang-migrate, source "file://migrations", database pgx)
8. Build repositories, services, handlers
9. Build chi router
10. http.ListenAndServe(":"+cfg.Port, router)
```

Router structure:

```go
r := chi.NewRouter()

// Global middleware (order matters)
r.Use(middleware.RequestID)
r.Use(middleware.Logger)
r.Use(cors.Handler(corsOptions))
r.Use(middleware.Recovery)

// Public routes
r.Get("/api/v1/health", healthHandler.Health)
r.Post("/api/v1/auth/google", authHandler.Google)
r.Post("/api/v1/auth/apple", authHandler.Apple)
r.Post("/api/v1/auth/refresh", authHandler.Refresh)
r.Post("/api/v1/auth/logout", authHandler.Logout)

// Authenticated routes
r.Group(func(r chi.Router) {
    r.Use(middleware.Authenticate(cfg.JWTSecret))
    r.Get("/api/v1/users/me", userHandler.GetMe)
    r.Patch("/api/v1/users/me", userHandler.UpdateMe)
})
```

CORS options:
```go
cors.Options{
    AllowedOrigins:   []string{cfg.WebOrigin, "http://localhost:5173"},
    AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
    ExposedHeaders:   []string{"X-Request-ID"},
    AllowCredentials: true,
    MaxAge:           86400,
}
```

---

## 11. Web App (`apps/web`)

### 11.1 Scaffold with Vite

- [x] From `apps/web/`, run:

```bash
pnpm create vite@latest . --template react-ts
```

Replace the generated `package.json` with the complete file in §11.2 below, then run `pnpm install`.

### 11.2 `apps/web/package.json` — name and scripts

> **This is the complete file** — do not merge it with the Vite template output; replace `package.json` with this. It preserves all Vite template dependencies and adds the test tooling.

Set the package name so `--filter=@mtamta/web` works in turbo and pnpm:

```json
{
  "name": "@mtamta/web",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@react-oauth/google": "^0.12.0",
    "@mtamta/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.0.0",
    "zustand": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

### 11.3 `apps/web/tsconfig.json`

- [x] Extend root base, add DOM libs (not in `tsconfig.base.json` — mobile doesn't need them), and reference `@mtamta/shared`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "paths": {
      "@mtamta/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

### 11.4 `apps/web/vite.config.ts`

- [x] Add path alias to match tsconfig:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
```

### 11.5 `apps/web/vitest.config.ts`

- [x] Create `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
```

> **jsdom** is required because `authStore.ts` imports Zustand which reads `window`. Tests mock `fetch` with `vi.stubGlobal('fetch', vi.fn())` — no additional setup file needed since jsdom provides the global `fetch` placeholder and Vitest resets stubs between tests by default.

### 11.6 Environment

- [x] Create `apps/web/.env.example`:

```
VITE_API_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

- [x] Create `apps/web/.env.local` (gitignored) with actual dev values.

### 11.7 Auth store — `apps/web/src/stores/authStore.ts`

- [x] Create `apps/web/src/stores/authStore.ts`:

```typescript
import { create } from 'zustand'
import type { User } from '@mtamta/shared'
import { tokenStorage, apiClient } from '../lib/api'  // platform wiring

interface AuthStore {
  user: User | null
  isLoading: boolean
  // Called by the apiClient's onRefresh — attempts silent token refresh via cookie.
  // Returns new access token or null on failure.
  refresh: () => Promise<string | null>
  signInWithGoogle: (idToken: string) => Promise<void>
  signOut: () => Promise<void>
  // Called on app mount — try to restore session via HttpOnly cookie.
  restoreSession: () => Promise<void>
}
```

- `signInWithGoogle`: call `apiClient.post<AuthResponse>('/api/v1/auth/google', { id_token })` → store `access_token` in `tokenStorage` → set `user` (refresh token arrives as HttpOnly cookie, no JS action needed)
- `restoreSession`: call `POST /api/v1/auth/refresh` **via raw `fetch`** with `credentials: 'include'` (not `apiClient`) — then store token and fetch user via `apiClient`; on 401 stay logged out
- `refresh`: call `POST /api/v1/auth/refresh` **via raw `fetch`** with `credentials: 'include'` — update `tokenStorage` with new access token → return it (or null on failure)
- `signOut`: call `POST /api/v1/auth/logout` **via raw `fetch`** with `credentials: 'include'` → `tokenStorage.clear()` → `user = null` (server clears the cookie; without `credentials: 'include'` the cookie is not sent and the token is never deleted from Redis)

> **Why raw `fetch` for refresh/logout?** `apiClient` retries on 401 by calling `onRefresh()`, which calls `authStore.refresh()`, which calls `apiClient`... — infinite recursion. Using raw `fetch` for the auth endpoints themselves breaks the loop. These three methods (`refresh`, `restoreSession`, `signOut`) are the only places in the codebase that call `fetch` directly.

```typescript
// Example — refresh() implementation
async refresh(): Promise<string | null> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',  // sends the HttpOnly cookie
  })
  if (!res.ok) return null
  const { access_token } = await res.json() as { access_token: string }
  tokenStorage.setAccessToken(access_token)
  return access_token
},
```

After creating the store, wire the callbacks to break the circular dependency:

```typescript
import { setAuthCallbacks } from '../lib/api'

// At the bottom of authStore.ts, after `const useAuthStore = create(...)`
setAuthCallbacks({
  onRefresh: () => useAuthStore.getState().refresh(),
  onAuthFailure: () => useAuthStore.getState().signOut(),
})
```

### 11.8 App shell — `apps/web/src/App.tsx`

- [x] Create `apps/web/src/App.tsx`:

Minimal structure for Phase 1:
```tsx
// On mount: call authStore.restoreSession()
// If isLoading: show spinner
// If user: show <Header user={user} onLogout={signOut} /> + <main>Welcome, {user.display_name}</main>
// If not user: show centered <GoogleLogin onSuccess={...} onError={...} />
```

### 11.9 `apps/web/src/main.tsx`

- [x] Wrap app in `<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>`:

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
```

---

## 12. Dockerfile

- [x] Create `apps/api/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /api ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /api /api
EXPOSE 8080
CMD ["/api"]
```

---

## 13. `railway.toml`

- [x] Create `railway.toml` at root:

```toml
[build]
dockerfilePath = "apps/api/Dockerfile"

[deploy]
startCommand = "/api"
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3
```

---

## 14. CI/CD

### 14.1 `.github/workflows/ci.yml`

- [x] Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb-ha:pg17
        env:
          POSTGRES_DB: mtamta_test
          POSTGRES_USER: mtamta
          POSTGRES_PASSWORD: mtamta
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready -U mtamta"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      DATABASE_URL: postgresql://mtamta:mtamta@localhost:5432/mtamta_test?sslmode=disable
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-do-not-use-in-production
      GOOGLE_CLIENT_ID: test-client-id
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache-dependency-path: apps/api/go.sum
      - run: go test ./...
        working-directory: apps/api

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test --filter=@mtamta/shared

  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build --filter=@mtamta/web

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
      - run: go vet ./...
        working-directory: apps/api
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: [test-api, test-web, build-web, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy API to Railway
        run: npx @railway/cli up --service api
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build --filter=@mtamta/web
      - name: Deploy web to Cloudflare Pages
        run: npx wrangler pages deploy apps/web/dist --project-name=mtamta
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Required GitHub secrets: `RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### 14.2 `.github/workflows/backup.yml`

- [x] Create `.github/workflows/backup.yml`:

```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly, Sunday 2am UTC
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Dump database
        run: |
          pg_dump "$DATABASE_URL" | gzip > backup-$(date +%Y%m%d).sql.gz
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Upload to R2
        run: |
          aws s3 cp backup-*.sql.gz s3://$R2_BUCKET/ \
            --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
```

Required secrets: `DATABASE_URL`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ACCOUNT_ID`

---

## 15. Tests

### 15.1 JWT unit tests

- [x] Create `apps/api/internal/auth/jwt_test.go`:

Table-driven tests:

| Case | Input | Expected |
|---|---|---|
| Valid token | Signed HS256 with correct secret, not expired | Returns claims with correct userID and email |
| Expired token | `exp` in the past | Error |
| Wrong secret | Signed with different secret | Error |
| Wrong algorithm | Token signed with RS256 instead of HS256 | Error — algorithm must be rejected even if signature is otherwise valid |
| Malformed string | `"not.a.jwt"` | Error |
| Empty string | `""` | Error |

> **Algorithm enforcement**: `ValidateAccessToken` must pass `jwt.WithValidMethods([]string{"HS256"})` to `jwt.ParseWithClaims`. Without this, an attacker could craft a token with `alg: none` or switch to an asymmetric algorithm and bypass verification.

### 15.2 Google verifier unit tests

- [x] Create `apps/api/internal/auth/google_test.go`:

Use `httptest.NewServer` to serve a mock JWKS, injected via `NewGoogleVerifierWithJWKS`:

- Valid token signed with mock RSA key, correct `aud` and `iss` → returns claims
- Expired `exp` → error
- Wrong `aud` → error
- Wrong `iss` → error
- Token signed with unknown `kid` (not in JWKS) → error
- Token using `alg: HS256` (wrong algorithm for Google tokens) → error
- Malformed token string → error

### 15.3 Auth integration tests

- [x] Create `apps/api/internal/auth/auth_integration_test.go` with build tag `//go:build integration`:

Uses the CI service containers (no `testcontainers-go` needed — CI already provides them via `DATABASE_URL` and `REDIS_URL` env vars). Run locally with `go test -tags=integration ./...` against docker-compose.

Tests:
1. **Full auth flow**: mock Google verifier → `POST /api/v1/auth/google` → 200 body has `access_token` and `user` (no `refresh_token`) → response sets `Set-Cookie: refresh_token=...; HttpOnly` → `GET /api/v1/users/me` with access token → 200 with user
2. **Refresh via cookie**: sign in → extract `refresh_token` cookie → `POST /api/v1/auth/refresh` with cookie → 200 new `access_token` → cookie refreshed
3. **Logout flow**: sign in → `POST /api/v1/auth/logout` with cookie → 204 → cookie cleared (`MaxAge=-1`) → `POST /api/v1/auth/refresh` with old cookie → 401
4. **Refresh token reuse after logout**: sign in → logout → attempt `POST /api/v1/auth/refresh` with the original token value (set manually in cookie) → 401 (token deleted from Redis)
5. **Request ID propagation**: any request → response header `X-Request-ID` is a non-empty UUID

### 15.4 User repository tests

- [x] Create `apps/api/internal/user/repository_test.go` with build tag `//go:build integration`:

- `Create` then `FindByID` round-trip — all fields match
- `Update` display_name → `FindByID` → new name returned
- `FindByID` with random UUID → error (not found)

### 15.5 API client unit tests — `packages/shared/src/api/client.test.ts`

- [x] Create `packages/shared/src/api/client.test.ts` (Vitest):

Tests cover the retry-on-401 behavior of `createApiClient` and, critically, the non-recursion guarantee.

**Setup helpers:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApiClient, createInMemoryTokenStorage } from '../index'
import type { ApiClientOptions } from '../api/client'

function makeClient(overrides?: Partial<ApiClientOptions>) {
  const tokenStorage = createInMemoryTokenStorage()
  const onRefresh = vi.fn<[], Promise<string | null>>()
  const onAuthFailure = vi.fn<[], void>()
  const client = createApiClient({
    baseURL: 'http://api.test',
    tokenStorage,
    onRefresh,
    onAuthFailure,
    ...overrides,
  })
  return { client, tokenStorage, onRefresh, onAuthFailure }
}
```

**Test cases:**

| # | Scenario | Setup | Assert |
|---|---|---|---|
| 1 | Successful request | `fetch` returns 200 | `onRefresh` not called; response data returned |
| 2 | 401 → refresh succeeds → retry succeeds | First `fetch` returns 401; `onRefresh` returns new token; second `fetch` returns 200 | `onRefresh` called once; result is second response data |
| 3 | 401 → refresh returns null | `fetch` returns 401; `onRefresh` returns null | `onAuthFailure` called once; error thrown; `fetch` called exactly once (no retry after null) |
| 4 | 401 → refresh succeeds → retry also 401 | Both `fetch` calls return 401; `onRefresh` returns new token | `onRefresh` called once; `onAuthFailure` called once; error thrown; **`fetch` called exactly twice** (original + one retry — no further recursion) |
| 5 | Non-401 error | `fetch` returns 404 | `onRefresh` not called; error thrown with parsed `ApiError` |
| 6 | Network error | `fetch` rejects | `onRefresh` not called; error propagates |

> **Test 4 is the recursion guard.** It proves that if the retried request also returns 401, the client calls `onAuthFailure` and stops — it does NOT call `onRefresh` a second time. Implementation must track an `isRetry` flag or check that `onRefresh` is only called once per original request.

**Note on refresh/logout endpoints:** `authStore.refresh()`, `restoreSession()`, and `signOut()` call `fetch` directly — not `apiClient` — so they never trigger the 401 interceptor. This is the primary recursion-prevention mechanism and does not require client-side logic. Test 4 covers the secondary guard (client-side retry limit) as defence-in-depth.

These three methods have their own tests in `apps/web/src/stores/authStore.test.ts` (use `vi.stubGlobal('fetch', vi.fn())` to mock the raw fetch calls):

| # | Method | Assert |
|---|---|---|
| 7 | `refresh()` | Raw `fetch` called with `{ method: 'POST', credentials: 'include' }`; `tokenStorage` updated with returned token |
| 8 | `restoreSession()` — success | `fetch` called with `credentials: 'include'`; user fetched via `apiClient`; store has `user` |
| 9 | `restoreSession()` — 401 | `fetch` returns 401; store remains `{ user: null }`; no further requests made |
| 10 | `signOut()` | `fetch` called to `/api/v1/auth/logout` with `credentials: 'include'`; `tokenStorage.getAccessToken()` returns `null` after; `user` is `null` — without `credentials: 'include'`, the cookie is not sent and the server cannot revoke the token in Redis |

---

## 16. Developer Experience

### 16.1 `Makefile` (root)

- [x] Create `Makefile` at root:

```makefile
.PHONY: dev test db-migrate db-reset seed lint

dev: ## Start docker services + API (air) + Vite dev server
	docker compose up -d
	cd apps/api && air &
	pnpm dev --filter=@mtamta/web

test: ## Run all tests
	cd apps/api && go test ./...
	pnpm test

lint: ## Run linters
	cd apps/api && go vet ./...
	pnpm lint

db-migrate: ## Run pending migrations
	cd apps/api && DATABASE_URL="$$DATABASE_URL" go run ./cmd/migrate up

db-reset: ## Wipe database and re-run migrations + seed
	docker compose down -v
	docker compose up -d postgres redis
	@echo "Waiting for postgres..."
	@sleep 5
	$(MAKE) db-migrate
	$(MAKE) seed

seed: ## Load seed data
	psql "$$DATABASE_URL" < data/seed/users.sql
```

### 16.2 Air config — `apps/api/.air.toml`

- [x] Create `apps/api/.air.toml`:

```toml
root = "."
tmp_dir = "tmp"

[build]
cmd = "go build -o ./tmp/api ./cmd/server"
bin = "./tmp/api"
include_ext = ["go"]
exclude_dir = ["tmp", "vendor", "migrations"]
delay = 200

[log]
time = false
```

### 16.3 `.env.example` (root)

- [x] Create `.env.example` at root:

```env
# Core
PORT=8080
ENV=development

# Database (matches docker-compose defaults)
DATABASE_URL=postgresql://mtamta:mtamta@localhost:5432/mtamta?sslmode=disable

# Redis (matches docker-compose defaults)
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=local-dev-secret-replace-in-production
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
APPLE_CLIENT_ID=com.your.bundleid

# CORS
WEB_ORIGIN=http://localhost:5173

# Monitoring (optional locally)
SENTRY_DSN=
```

### 16.4 Seed data — `data/seed/users.sql`

- [x] Create `data/seed/users.sql` with 3 demo users and their auth_providers rows:

```sql
INSERT INTO users (id, display_name, email, bio) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice Alpinist', 'alice@example.com', 'Backcountry skier, Mont Blanc summiteer'),
  ('00000000-0000-0000-0000-000000000002', 'Bob Backcountry', 'bob@example.com', 'Powder chaser'),
  ('00000000-0000-0000-0000-000000000003', 'Carol Climber', 'carol@example.com', 'Sport and trad, 6c+')
ON CONFLICT DO NOTHING;

INSERT INTO auth_providers (user_id, provider, provider_uid, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'google', 'google-uid-alice-001', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'google', 'google-uid-bob-002',   'bob@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'google', 'google-uid-carol-003', 'carol@example.com')
ON CONFLICT DO NOTHING;
```

---

## 17. File Tree — End State

```
mtamta/
├── .editorconfig
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── backup.yml
├── Makefile
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── railway.toml
├── tsconfig.base.json
├── turbo.json
├── apps/
│   ├── api/
│   │   ├── .air.toml
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── cmd/
│   │   │   ├── server/main.go
│   │   │   └── migrate/main.go
│   │   ├── internal/
│   │   │   ├── auth/
│   │   │   │   ├── apple.go
│   │   │   │   ├── google.go
│   │   │   │   ├── jwt.go
│   │   │   │   ├── repository.go
│   │   │   │   ├── service.go
│   │   │   │   ├── handler.go
│   │   │   │   ├── jwt_test.go
│   │   │   │   ├── google_test.go
│   │   │   │   └── auth_integration_test.go
│   │   │   ├── cache/redis.go
│   │   │   ├── config/config.go
│   │   │   ├── db/db.go
│   │   │   ├── health/handler.go
│   │   │   ├── middleware/
│   │   │   │   ├── auth.go
│   │   │   │   ├── keys.go
│   │   │   │   ├── logger.go
│   │   │   │   ├── recovery.go
│   │   │   │   └── requestid.go
│   │   │   └── user/
│   │   │       ├── user.go
│   │   │       ├── repository.go
│   │   │       ├── service.go
│   │   │       ├── handler.go
│   │   │       └── repository_test.go
│   │   └── migrations/
│   │       ├── 001_init.up.sql
│   │       └── 001_init.down.sql
│   └── web/
│       ├── .env.example
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── lib/api.ts
│           └── stores/
│               ├── authStore.ts
│               └── authStore.test.ts
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── api/
│           │   ├── client.ts
│           │   └── client.test.ts
│           ├── storage/tokens.ts
│           └── types/
│               ├── auth.ts
│               └── user.ts
└── data/
    └── seed/
        └── users.sql
```

---

## 18. Acceptance Criteria

From `Plan.md` — verify each before declaring Phase 1 complete:

- [x] `make dev` starts all services (docker-compose + API hot reload + Vite dev server)
- [x] `make seed` loads seed data without errors
- [x] JWT unit tests pass: valid, expired, malformed, wrong-secret cases
- [x] Integration test: mock Google ID token → access token in body + `Set-Cookie: refresh_token; HttpOnly` → authenticated request succeeds
- [x] `POST /api/v1/auth/google` with valid ID token returns 200 with `{ access_token, user }` body and `Set-Cookie: refresh_token; HttpOnly; SameSite=Lax; Path=/api/v1/auth`
- [x] `POST /api/v1/auth/apple` with valid ID token returns 200 with `{ access_token, user }` body and sets refresh cookie
- [x] `POST /api/v1/auth/refresh` with valid refresh cookie returns 200 with new `{ access_token }` (no body token needed)
- [x] `POST /api/v1/auth/logout` returns 204 and invalidates the refresh token
- [x] `GET /api/v1/users/me` with valid JWT returns current user
- [x] `PATCH /api/v1/users/me` updates display name and bio
- [x] Web app renders, allows Google Sign-In, displays logged-in user's name
- [x] Database migrations run cleanly on fresh TimescaleDB+PostGIS instance
- [x] `@mtamta/shared` types and API client importable from `apps/web`
- [x] Every API response includes `X-Request-ID` header; all log lines include the same ID
- [x] API logs structured JSON in production with `request_id`, `method`, `path`, `status`, `duration_ms`, `user_id`
- [x] Errors captured in Sentry with request ID, user ID, and stack trace
- [x] `GET /api/v1/health` returns 200 when both postgres and redis are up; 503 if either is down
- [x] GitHub Actions CI passes on push (`go test`, `turbo build`, `go vet`, `tsc`)
- [x] Merging to `main` auto-deploys API to Railway and web to Cloudflare Pages

---

## 19. Mapbox Implementation Notes (Pre-Phase 2)

> Derived from Mapbox official skills review of Architecture.md and Plan.md. These notes do **not** require Phase 1 work — they are guardrails to follow when implementing Phase 2 (Maps Core).

### 19.1 React Lifecycle Pattern (Critical)

Plan.md specifies `MapContainer.tsx` but doesn't define the required lifecycle pattern. The only correct React pattern for Mapbox GL JS is:

```tsx
import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'  // ← REQUIRED — map is invisible without this

function MapContainer() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mapRef.current) return  // prevent double-init in React strict mode

    mapRef.current = new mapboxgl.Map({
      accessToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,  // v3.x: pass in constructor
      container: containerRef.current!,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [8.5, 47.0],
      zoom: 9,
    })

    // CRITICAL: always clean up — prevents memory leaks on route changes
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />
}
```

**Rules:**
- Store map instance in `useRef`, not `useState` (state triggers re-render)
- Empty `[]` deps — initialize once on mount
- **Always return the cleanup function** calling `map.remove()` — omitting this leaks WebGL contexts and event listeners on every navigation
- `import 'mapbox-gl/dist/mapbox-gl.css'` must be imported once (in `MapContainer.tsx` or in `main.tsx`)
- Use Mapbox GL JS **v3.x** — pass `accessToken` in the Map constructor (v3 preferred over the global `mapboxgl.accessToken = ...` pattern)

### 19.2 Token Scope (Security)

`VITE_MAPBOX_ACCESS_TOKEN` is a public `pk.*` token — it is intentionally client-visible. However:

- **It must be a `pk.*` token** — never a `sk.*` secret token. Secret tokens grant write access to your account.
- **Add URL restrictions** in the Mapbox token settings dashboard for each environment:
  - `dev`: `http://localhost:*`
  - `staging`: `https://staging.mtamta.com`
  - `prod`: `https://mtamta.com`, `https://*.mtamta.com`
- Rotate the token immediately if it appears in a public git commit.
- The Mapbox Directions API is proxied through the backend (`/api/v1/map/directions`) — the backend calls Mapbox with a **server-side** `sk.*` token stored in the Railway environment, never exposed to the browser.

Add to `apps/web/.env.example`:
```
VITE_MAPBOX_ACCESS_TOKEN=pk.your_token_here
```

### 19.3 Layer Ordering (User Content Above POIs)

Architecture.md lists layer types but doesn't specify z-ordering. The rule from Mapbox cartography guidance:

```
Background → Landuse → Water → Terrain/Hillshade → Buildings → Roads → Borders → Labels → POI symbols → USER CONTENT
```

**User content (trip routes, waypoints, user position dot) must render above POI symbols** — not below. A route line covering a café icon is acceptable; a café icon covering a route line is a bug.

In Phase 2, when adding the trip route layer:
```typescript
// Add trip route source + layer AFTER map style loads
map.on('load', () => {
  map.addSource('trip-route', { type: 'geojson', data: routeGeoJSON })

  // addLayer with `beforeId` omitted = appended on top of all existing layers ✓
  map.addLayer({
    id: 'trip-route-line',
    type: 'line',
    source: 'trip-route',
    paint: { 'line-color': '#e63946', 'line-width': 3 },
  })
  // User position dot added last = topmost layer ✓
})
```

### 19.4 Performance: Parallel Data Loading

Don't wait for the map `load` event before starting API requests. Fetch trip data in parallel with map initialization:

```tsx
useEffect(() => {
  // Start both concurrently — don't chain sequentially
  const mapInstance = new mapboxgl.Map({ ... })
  const tripPromise = fetchTripRoute(tripId)  // starts immediately

  mapInstance.on('load', async () => {
    const trip = await tripPromise  // likely already resolved
    mapInstance.addSource('trip-route', { type: 'geojson', data: trip.geojson })
    mapInstance.addLayer({ ... })
  })
}, [])
```

For non-critical layers (slope angle overlay, avalanche zones), defer initialization:
```typescript
requestIdleCallback(() => {
  map.addLayer({ id: 'slope-angle', ... })
})
```

### 19.5 Third-Party Tile Sources (Phase 3 CORS Note)

Architecture.md plans OpenTopoMap and national agency tiles (swisstopo, IGN, etc.) as raster sources. These are cross-origin — add `credentials: 'omit'` to avoid CORS preflight failures:

```typescript
map.addSource('opentopomap', {
  type: 'raster',
  tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: '© OpenTopoMap contributors',
  // No credentials: field = browser defaults to 'same-origin' and sends preflight
})
```

Mapbox GL JS `addSource` does not expose a `credentials` option directly — tile requests are made by the GL worker. To avoid CORS issues, confirm each national tile provider allows cross-origin access (most public WMTS/XYZ providers do via `Access-Control-Allow-Origin: *`). Test each provider before adding to the layer list.

### 19.6 Geospatial Tool Selection (Phase 4+)

From the geospatial operations skill — use the right tool per calculation type:

| Need | Tool | Why |
|---|---|---|
| Trip length (straight-line segments) | Turf.js `length()` client-side | Instant, no API call needed |
| Elevation gain from GPX | Parse GPX elevations directly | Already in track data |
| Route snapping to trail | Mapbox Directions API (walking profile, proxied) | Requires road/trail network |
| "Is this point in this avalanche zone?" | Turf.js `booleanPointInPolygon()` | Pure geometry, instant |
| Travel-time isochrone around trailhead | Mapbox Isochrone API | Requires routing network |
| Slope angle at a point | Mapbox Terrain RGB decode | Client-side, no extra API |

Install Turf.js in `packages/map-core` (Phase 4):
```bash
pnpm add @turf/turf --filter @mtamta/map-core
```

### 19.7 3D Terrain Exaggeration

Plan.md specifies `exaggeration: 1.5` — this is appropriate for alpine terrain. Note:
- Exaggeration `1.0` = true scale
- `1.5` gives the Alps visible relief without distorting route distances visually
- For very flat terrain (Scandinavia fjords) consider `2.0`–`3.0`; for Himalayan scale `1.0`–`1.2` is already dramatic

Add an exaggeration slider in the UI as planned, range `1.0`–`3.0`, step `0.1`.