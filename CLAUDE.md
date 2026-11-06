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

Single shared password, not per-user accounts: `POST /api/auth/login` checks `APP_PASSWORD` and returns a bearer token (`artifacts/api-server/src/routes/auth/index.ts`). The frontend stores it in `localStorage` as `app_auth_token` (constant `AUTH_TOKEN_KEY` in `pages/Login.tsx`) and sends it as `Authorization: Bearer <token>`. Tokens are in-memory only (`middleware/auth.js`) — they're invalidated on every server restart, and rotating `APP_PASSWORD` does not retroactively affect an already-published deployment; it must be redeployed for the new value to take effect in production.

This is a separate layer from Replit's own deployment-level **Visibility** setting (Public / Password protected / Private, configured in Replit's "Publishing" panel). Don't confuse the two when debugging access issues.

**Auth headers are only automatic through the generated client.** `main.tsx` wires `setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY))` so hooks from `@workspace/api-client-react` attach the bearer token automatically. But `StepUploadFiles.tsx` (file upload), `StepModifyRows.tsx` (`read-values`), and `StepPreviewExport.tsx` (file download) use hand-rolled `fetch()` calls instead — typical for `FormData`/blob bodies that codegen doesn't cover well — and each has to read `localStorage.getItem("app_auth_token")` and attach `Authorization: Bearer <token>` manually. If you add a new raw `fetch()` call, don't forget this: a missing header here 401s silently and looks like a normal network failure, not an auth error. It also won't trigger the app's global 401 handler (`App.tsx`'s query/mutation cache subscriptions, which force a logout+reload) since that only observes requests made through react-query — a raw `fetch()`'s 401 just surfaces as a local "upload/download failed" error in that component.

## Excel processing gotchas

`artifacts/api-server/src/lib/excelProcessor.ts` locates the "month block" (Hours/EFTE columns) in each uploaded sheet by scanning a header-row window for a month name, then confirming the row directly below has Hours/EFTE labels. This used to be case-sensitive and locked to rows 7–10, which silently dropped locations whose file had slightly different casing/layout from the "preview & export" results — no error, they just vanished. It's now case-insensitive and tolerates row drift, but **always accepts a header row only if the very next row has recognizable Hours/EFTE labels** — don't loosen that check, it exists specifically to avoid false-matching metadata cells like "Month: Mai" elsewhere in the sheet.

Any location that still can't be matched is now surfaced (not silently dropped) via a `skipped: SkippedLocation[]` field in the preview/export API response, shown in the UI and in the exported change report. If you touch this logic, keep that safety net intact.

## Adjustment rules (Modify Rows step)

Each rule has a mode (`plusMinus` in the API: `+`, `−` or `=`) and a scope (`divisor` in the API). **Scope:** `divisor` 0 = own location only; `divisor` > 0 = all locations. The divisor's numeric value is irrelevant beyond 0 vs. > 0 — the UI offers an "Own location / All locations ÷ N" select that stores 0 or 1. An all-locations rule is computed from the rule's selected (source) location and **always divided by the number of uploaded locations N** (= number of uploaded files), in every mode; the one result is written to every location (decided with the user, 2026-11-05). **Mode:** `+`/`−` add/subtract the entered Hours Adj. / EFTE Adj. to the current value; `=` overwrites with the entered value, independent of the current value (also into empty cells). In own-location scope `=` writes the value as entered (unrounded); in all-locations scope it is divided by N and rounded to 2 decimals like `+`/`−`. A field left at 0 in `=` mode writes 0.

The calculation exists twice and must stay in sync: `calcNew` in `artifacts/excel-tool/src/components/wizard/StepModifyRows.tsx` (live Cur./New columns) and `calcNew` plus `precomputeSourceValues` in `artifacts/api-server/src/lib/excelProcessor.ts` (what preview and export actually use); both take the location count as a parameter. Adding or changing a mode also means editing the `plusMinus` enum in `lib/api-spec/openapi.yaml`, re-running codegen and updating the type in `sessionStore.ts`; otherwise the generated zod schema rejects the new value with a 400.

## Karenz / other-cluster entries

`session.karenzEntries` (Step 3 "Karenz / other cluster" block): each entry is a person taken out of the **original** values of one row at one location *before* the adjustment rules run. `kind` `karenz` subtracts the entered hours/EFTE (several entries on the same cell are summed); `kind` `cluster` (person belongs to another cluster) sets the row at that location to 0 — no amounts needed. Order of effects: Delete rows → Karenz/cluster entries → adjustment rules (`+`/`−` and the all-locations source value work on the reduced "base"; an entry on a row that no rule writes to simply writes the reduced value). Entries on rows cleared by "Delete rows" are ignored. The **last** rule writing to a cell decides whether an entry has any effect (a `=` rule, or an all-locations rule at a non-source location, overwrites it). Optional `returnMonth` (YYYY-MM) only triggers a warning; the processed year is read from the "Year" row of the files.

Logic lives in `artifacts/api-server/src/lib/removals.ts` plus `excelProcessor.ts` (`previewChanges`, `buildMasterExcel`, `readCurrentValues` returns `baseHours`/`karenzHours`/… for the Step 4 columns). Anything that looks wrong (unknown location, row cleared or overwritten, negative result, empty cell, return month reached) is reported in `PreviewResult.warnings` and shown in Step 5 — in line with the "never drop silently" rule above.

## Monthly playbook (the change report)

Every export's `Change_Report_<Month>.txt` doubles as next month's playbook: besides the human-readable result tables it lists the configured Karenz entries and rules, and ends with a machine-readable JSON block between the markers `<<<EFTE-PLAYBOOK-BEGIN>>>` / `<<<EFTE-PLAYBOOK-END>>>` (built by `buildPlaybook` in `artifacts/api-server/src/lib/pdfGenerator.ts`; format `efte-playbook`, `formatVersion` 1). It holds month, location count, delete rows, Karenz/cluster entries and the rules (location, row, mode, scope `own`/`all`, remarks). **Rule amounts are stored only as `previousHoursAdjustment`/`previousEfteAdjustment` for reference** — the monthly amounts come from an external source via the Staff EFTE calculator and must be re-entered each month, never silently reused. Playbook files contain real location names and figures: keep them out of Git (the user stores them outside the repo).

**Loading** (Step 1, `PlaybookLoader.tsx` + `artifacts/excel-tool/src/lib/playbook.ts`, which duplicates the two markers and validates the JSON with zod): the file is parsed in the browser and written to the session through the normal `PATCH /sessions/:id` — `deleteRows`, `karenzEntries`, `modifyRows` (amounts 0, `pending: true`, `previousHoursAdjustment`/`previousEfteAdjustment` for the "Prev." display) and `playbookSource` (month, location count, file name). Steps 3 and 4 simply show that session data. A rule stays `pending` until the user types an amount or clicks the "Amount needed" marker (a deliberate 0 needs that click); the flag is cleared in `StepModifyRows.tsx`. Reports from before the playbook feature have no block and are rejected with a message. The preview warns (`buildRuleWarnings` in `excelProcessor.ts`) about pending rules, a source location that isn't uploaded, a changed location count and a playbook that isn't from the previous month; never turn these into silent behaviour.

## App version

The version shown in the header (`Wizard.tsx`, e.g. `v1.1.0`) comes from `version` in `artifacts/excel-tool/package.json` — the single source. `vite.config.ts` injects it as `import.meta.env.VITE_APP_VERSION` via `define`. It is bumped by hand; ask the user when a bump is wanted.

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
