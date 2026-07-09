# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

EFTE Merge & Edit Tool — a wizard-style web app that merges/edits hotel EFTE Excel scheduling reports across multiple locations (upload → select month → delete rows → modify rows → preview/export). Originally built solo in Replit without git; now maintained here as a pnpm workspace monorepo (Node 24, TypeScript 5.9).

## Repository layout

- `artifacts/api-server` — Express 5 API: auth (`APP_PASSWORD`-gated), in-memory session store, Excel processing (`xlsx` package)
- `artifacts/excel-tool` — React + Vite wizard frontend
- `artifacts/mockup-sandbox` — Replit-internal design/canvas tool only; **not** part of production deployment
- `lib/api-spec` — OpenAPI spec, source of truth for the API contract
- `lib/api-client-react`, `lib/api-zod` — generated from `lib/api-spec` via Orval codegen; never hand-edit files under `src/generated/`
- `scripts` — misc workspace scripts (e.g. `post-merge.sh`)
- `EFTE_Dummy/` — sanitized sample `.xls` location files for testing the Excel processing logic

## Common commands

```
pnpm install                                              # first-time / after pulling
pnpm run typecheck                                        # full workspace typecheck
pnpm run build                                             # typecheck + build all packages
pnpm --filter @workspace/api-server run dev                 # run API server (port 5000/8080 depending on env)
pnpm --filter @workspace/excel-tool run dev                 # run frontend (needs PORT + BASE_PATH env)
pnpm --filter @workspace/api-spec run codegen                # regenerate api-client-react / api-zod from openapi.yaml
```

Required env for the API server: `APP_PASSWORD` (the app's own login password). `DATABASE_URL` / `@workspace/db` are listed in `replit.md` as required but are **unused dead scaffolding** — don't set up a database for this tool.

## How auth works

Single shared password, not per-user accounts: `POST /api/auth/login` checks `APP_PASSWORD` and returns a bearer token (`artifacts/api-server/src/routes/auth/index.ts`). The frontend stores it in `localStorage` as `app_auth_token` (constant `AUTH_TOKEN_KEY` in `pages/Login.tsx`) and sends it as `Authorization: Bearer <token>`. Tokens are in-memory only (`middleware/auth.js`) — they're invalidated on every server restart.

This is a separate layer from Replit's own deployment-level **Visibility** setting (Public / Password protected / Private, configured in Replit's "Publishing" panel). Don't confuse the two when debugging access issues.

## Excel processing gotchas

`artifacts/api-server/src/lib/excelProcessor.ts` locates the "month block" (Hours/EFTE columns) in each uploaded sheet by scanning a header-row window for a month name, then confirming the row directly below has Hours/EFTE labels. This used to be case-sensitive and locked to rows 7–10, which silently dropped locations whose file had slightly different casing/layout from the "preview & export" results — no error, they just vanished. It's now case-insensitive and tolerates row drift, but **always accepts a header row only if the very next row has recognizable Hours/EFTE labels** — don't loosen that check, it exists specifically to avoid false-matching metadata cells like "Month: Mai" elsewhere in the sheet.

Any location that still can't be matched is now surfaced (not silently dropped) via a `skipped: SkippedLocation[]` field in the preview/export API response, shown in the UI and in the exported change report. If you touch this logic, keep that safety net intact.

## Local dev on Windows

Running `artifacts/excel-tool`'s `vite dev` on Windows can fail with "Cannot find module" for `@rollup/rollup-win32-x64-msvc`, `lightningcss-win32-x64-msvc`, or `@tailwindcss/oxide-win32-x64-msvc` (a known pnpm/npm optional-dependency bug). Fix locally with `pnpm add -D -w <package>` — but **revert these from `package.json`/`pnpm-lock.yaml` before committing**; they're Windows-only native binaries and would break `pnpm install` on Replit's Linux hosting if left in as hard devDependencies.

`pnpm-workspace.yaml` has an `allowBuilds` section — if `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`, check that entries there are `true`/`false`, not left as unfilled placeholders.

## Testing / verification

There's no automated test suite. Verify changes by actually running the app:
- Backend logic: exercise the real API routes (login → create session → upload → configure → preview/export) rather than trusting code review alone.
- Frontend: the upload step's file input can't be driven by a native file-picker in browser automation — inject a `File` via `DataTransfer` and dispatch a `change` event instead (copy a sample file into `artifacts/excel-tool/public/` temporarily, `fetch()` it in-page, then delete the temp file afterward). Scope button lookups to `main` when clicking wizard "Next" buttons — the header's "New Session" button is also a plain `<button>` and generic selectors can hit it by accident.

## Deployment (Replit)

Deployment config already exists and shouldn't need code changes: `.replit` (`deploymentTarget = "autoscale"`, `router = "application"`) plus per-artifact `.replit-artifact/artifact.toml` files define path-based routing (`/api` → api-server, `/` → excel-tool) for a single combined deployment. In the Replit UI this is called **"Publishing"**, not "Deploy". Production secrets (incl. `APP_PASSWORD`) live under Publishing → Adjust settings → "Production app secrets", a separate store from the dev workspace's Secrets pane.

Every "Republish" click auto-commits an empty checkpoint commit to `main` ("Published your App", authored by `Replit Agent`). When pushing from another clone after a Republish, expect to `git fetch && git rebase origin/main` — it's a clean, conflict-free rebase.
