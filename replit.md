# EFTE Merge & Edit Tool

A password-protected internal tool for merging multiple Excel location reports, editing rows (bulk hours/EFTE adjustments), and exporting the result as Excel/PDF.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/excel-tool run dev` — run the frontend (Excel Merge & Edit Tool)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `APP_PASSWORD` — password users must enter to access the app (shared, dev + prod). Changing it requires a redeploy to take effect in production — see Gotchas.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/excel-tool/src/pages/Wizard.tsx` — 3-step wizard: Upload Files → Select Month → Modify/Delete Rows → Preview/Export
- `artifacts/excel-tool/src/pages/Login.tsx` — password gate; stores token under localStorage key `app_auth_token` (exported as `AUTH_TOKEN_KEY`)
- `artifacts/excel-tool/src/components/wizard/` — one component per wizard step (StepUploadFiles, StepModifyRows, StepPreviewExport, etc.)
- `artifacts/excel-tool/src/hooks/use-wizard-session.ts` — session lifecycle (create/recreate on server restart)
- `artifacts/api-server/src/routes/auth/` — `/api/auth/login`, checks `APP_PASSWORD` env var, issues bearer tokens
- `artifacts/api-server/src/middleware/auth.ts` — `requireAuth` middleware + in-memory token set
- `artifacts/api-server/src/routes/sessions/` — session-scoped upload/merge/modify/export endpoints (all behind `requireAuth`)
- `lib/api-spec/openapi.yaml` — source of truth for the API contract

## Architecture decisions

- Auth is a simple shared-password gate (not per-user accounts): one `APP_PASSWORD` secret, bearer tokens issued on login, tokens kept in an in-memory `Set` on the API server (no DB/session store).
- Because tokens are in-memory, any API server restart invalidates all issued tokens — the frontend must detect 401s and force re-login rather than looping/erroring silently.

## Product

- Upload up to 15 Excel location reports (.xlsx/.xls)
- Select a target month, merge the reports into one sheet
- Apply bulk row adjustments (hours/EFTE +/-, divisor-based allocation across locations) with an optional Remarks note per rule (Remarks column is the last column, both in the edit UI and the exported report)
- Preview all rows that will be adjusted (scrollable list) before exporting
- Export merged/adjusted result as Excel or PDF
- Gated behind a single shared password (`APP_PASSWORD`)

## User preferences

- UI/communication with this user is in German.

## Gotchas

- **Raw `fetch()` calls bypass auth.** Only requests made through the generated `@workspace/api-client-react` hooks automatically get the `Authorization: Bearer <token>` header (via `setAuthTokenGetter`). Any hand-written `fetch()` (file upload, read-values, downloads) must manually attach `Authorization: Bearer <token>` from `localStorage.getItem("app_auth_token")`, or it will silently 401.
- **Changing `APP_PASSWORD` (or any secret) does not affect the already-published production deployment** — the live deployment keeps running its previously-built image/env until you publish again. After rotating the password, redeploy for it to take effect in production.
- Tokens are in-memory on the API server, so every server restart (including deploys) invalidates all sessions — the frontend has a global 401 handler (in `App.tsx`, via the React Query cache) that clears the stored token and forces re-login when this happens.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
