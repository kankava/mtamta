# mtamta — Dependency Upgrades

> Upgrade plan and history for frontend, backend, and tooling dependencies. Last reviewed: 2026-05-15.

---

## Current Versions

| Package | Version | Status |
|---------|---------|--------|
| TypeScript | 6.0.3 | Current |
| ESLint | 10.4.0 | Current |
| eslint-plugin-react-hooks | 7.1.1 | Current |
| typescript-eslint | 8.59.3 | Current |
| Prettier | 3.8.3 | Current |
| React | 19.2.6 | Current |
| React DOM | 19.2.6 | Current |
| React Router | 7.15.1 | Current |
| Vite | 8.0.13 | Current (Rolldown) |
| Vitest | 4.1.6 | Current |
| @vitejs/plugin-react | 6.0.2 | Current |
| jsdom | 29.1.1 | Current |
| Mapbox GL JS | 3.23.1 | Current |
| @maptiler/sdk | 4.0.2 | Current |
| Zustand | 5.0.13 | Current |
| @react-oauth/google | 0.13.5 | Current |
| Tailwind CSS | 4.3.0 | Current (v4, Vite plugin) |
| @tailwindcss/vite | 4.3.0 | Current |
| Turborepo | 2.9.14 | Current |
| pnpm | 11.1.2 | Current |
| @types/node | 24.12.4 | Current (matches Node 24 LTS) |
| Node.js | 24 LTS | Current (CI + `.nvmrc`) |
| Go | 1.26.0 | Current (go.mod) |
| getsentry/sentry-go | 0.46.2 | Current |
| jackc/pgx/v5 | 5.9.2 | Current |
| redis/go-redis/v9 | 9.19.0 | Current |

---

## Completed Upgrades (2026-05-15)

### Frontend & tooling

| Package | Before | After | Notes |
|---------|--------|-------|-------|
| TypeScript | 5.9.3 | 6.0.3 | Major bump, no code changes — typecheck clean |
| @maptiler/sdk | 3.11.1 | 4.0.2 | Major bump. v4 removes `enableGlobeProjection`/`enableMercatorProjection` (we already use `setProjection`) and drops some re-exported MapLibre types — none in use. No code changes |
| jsdom | 25.0.1 | 29.1.1 | Major bump, test-only — all tests pass |
| pnpm | 9.15.0 | 11.1.2 | Two majors. Lockfile stays at v9.0 format. `packageManager` field + README updated; CI reads the field via `pnpm/action-setup@v4` |
| Node.js | 22 | 24 LTS | CI `node-version` (×4) bumped; added `.nvmrc`; README updated. Web deploys as static assets, build runs in CI — no Cloudflare-side impact |
| @types/node | 22.19.19 | 24.12.4 | Bumped to match the Node 24 runtime |
| React + React DOM | 19.2.4 | 19.2.6 | Patch bump |
| React Router | 7.13.1 | 7.15.1 | Minor bump |
| Vite | 8.0.0 | 8.0.13 | Patch bumps |
| Vitest | 4.1.0 | 4.1.6 | Patch bumps |
| Mapbox GL JS | 3.20.0 | 3.23.1 | Minor bump |
| Zustand | 5.0.11 | 5.0.13 | Patch bump |
| Tailwind CSS + @tailwindcss/vite | 4.2.1 | 4.3.0 | Minor bump |
| ESLint | 10.0.3 | 10.4.0 | Minor bump |
| eslint-plugin-react-hooks | 7.0.1 | 7.1.1 | Minor bump |
| Turborepo | 2.8.17 | 2.9.14 | Minor bump |
| typescript-eslint | 8.56.1 | 8.59.3 | Minor bump |
| Prettier | 3.8.1 | 3.8.3 | Patch bump |
| @vitejs/plugin-react | 6.0.1 | 6.0.2 | Patch bump |
| @react-oauth/google | 0.13.4 | 0.13.5 | Patch bump |

### Backend (Go)

| Package | Before | After | Notes |
|---------|--------|-------|-------|
| Go (go.mod directive) | 1.24.0 | 1.26.0 | Bumped to match installed toolchain. CI (`ci.yml` ×2), `apps/api/Dockerfile`, and README updated to Go 1.26 |
| getsentry/sentry-go | 0.43.0 | 0.46.2 | Minor bump |
| jackc/pgx/v5 | 5.8.0 | 5.9.2 | Minor bump |
| redis/go-redis/v9 | 9.18.0 | 9.19.0 | Minor bump |

---

## Completed Upgrades (2026-03-14)

| Package | Before | After | Notes |
|---------|--------|-------|-------|
| Mapbox GL JS | 3.19.1 | 3.20.0 | Patch bump, no changes needed |
| Zustand | 4.5.7 | 5.0.11 | Already using named imports, zero migration |
| @react-oauth/google | 0.12.2 | 0.13.4 | Drop-in upgrade |
| React + React DOM | 18.3.1 | 19.2.4 | No code changes needed — no forwardRef, useRef already had args |
| React Router | 6.30.3 (react-router-dom) | 7.13.1 (react-router) | Swapped package, updated single import path |
| Vite | 5.4.21 | 8.0.0 | Now uses Rolldown (Rust bundler). Build time ~644ms |
| Vitest | 2.1.9 | 4.1.0 | Drop-in upgrade, all 48 tests pass |
| @vitejs/plugin-react | 4.7.0 | 6.0.1 | Required for Vite 8 |

---

## Remaining Upgrades

None outstanding — all dependencies are current as of 2026-05-15.

---

## Notes

### pnpm 10+ behavior change — dependency build scripts

pnpm 10 stopped running dependency lifecycle scripts (`postinstall` etc.) by default. As of this upgrade no dependency needs one (`pnpm install` reports no ignored build scripts). If a future dependency does, allowlist it with `pnpm approve-builds` / the `onlyBuiltDependencies` field.

### @tailwindcss/vite peer warning

Tailwind's Vite plugin may still lag Vite's latest major in its declared peer range. Works fine in practice.

### eslint-plugin-react-hooks peer warning

`eslint-plugin-react-hooks` has lagged in adding ESLint 10 to its peer dep range. Cosmetic — works fine.
