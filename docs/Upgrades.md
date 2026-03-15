# mtamta — Dependency Upgrades

> Upgrade plan and history for frontend and tooling dependencies. Last reviewed: 2026-03-15.

---

## Current Versions

| Package | Version | Status |
|---------|---------|--------|
| TypeScript | 5.9.3 | Current |
| ESLint | 10.0.3 | Current |
| React | 19.2.4 | Current |
| React DOM | 19.2.4 | Current |
| React Router | 7.13.1 | Current |
| Vite | 8.0.0 | Current (Rolldown) |
| Vitest | 4.1.0 | Current |
| @vitejs/plugin-react | 6.0.1 | Current |
| Mapbox GL JS | 3.20.0 | Current |
| Zustand | 5.0.11 | Current |
| @react-oauth/google | 0.13.4 | Current |
| Tailwind CSS | 4.2.1 | Current (v4, Vite plugin) |
| @tailwindcss/vite | 4.2.1 | Current |
| Turborepo | 2.8.14 | Current |
| pnpm | 9.15.0 | Major behind (10.x available) |
| Go | 1.24.0 | Current (go.mod) |

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

### pnpm 9 → 10

- Major version — lockfile format changes
- Affects entire monorepo tooling
- Research pnpm 10 migration guide before committing
- Update `"packageManager"` field in root `package.json`
- May need to regenerate `pnpm-lock.yaml`
- Do this upgrade alone, not bundled with other changes

---

## Notes

### @tailwindcss/vite peer warning

```
@tailwindcss/vite 4.2.1
  └── ✕ unmet peer vite@"^5.2.0 || ^6 || ^7": found 8.0.0
```

Tailwind's Vite plugin hasn't added Vite 8 to its peer dep range yet. Works fine in practice.

### eslint-plugin-react-hooks peer warning

```
eslint-plugin-react-hooks 7.0.1
  └── ✕ unmet peer eslint@"^3.0.0 || ... || ^9.0.0": found 10.0.3
```

This is a known issue — `eslint-plugin-react-hooks` hasn't updated its peer dep range to include ESLint 10 yet. It works fine, the warning is cosmetic.

### Vite CJS deprecation warning (resolved)

The "CJS build of Vite's Node API is deprecated" warning from Vitest 2 is gone with Vitest 4 + Vite 8.
