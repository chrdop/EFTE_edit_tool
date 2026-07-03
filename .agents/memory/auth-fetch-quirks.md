---
name: Auth token quirks in mixed fetch/generated-client apps
description: When a codebase mixes a generated API client (with auto-attached auth headers) and hand-written fetch() calls (file upload, downloads), the raw fetch calls silently miss auth and 401.
---

In apps using a generated OpenAPI client (e.g. `@workspace/api-client-react` with `setAuthTokenGetter`), auth headers are only attached automatically to requests made through the generated hooks. Any hand-rolled `fetch()` — typically for `FormData` uploads, blob downloads, or one-off endpoints not covered by codegen — does NOT get the header and will 401 without an obvious error, because it looks like a normal network call.

**Why:** File upload and file download flows are the most common cases where developers reach for raw `fetch()` instead of the generated client (multipart bodies / blob responses aren't always well supported by codegen), so they're the most common source of silent auth gaps after adding password/token protection to an app.

**How to apply:** When adding or debugging bearer-token auth in an app with a generated API client, grep for `fetch(` across the frontend and manually verify each call attaches `Authorization: Bearer <token>` (usually via `localStorage.getItem(<token key>)`), rather than assuming the generated client's auto-attach covers every request.

Related: token stores that live only in server memory (`Set` of valid tokens, no DB/session store) are wiped on every server restart/redeploy — the frontend needs a global 401 handler that clears the stored token and forces re-login, otherwise it hangs in a broken authenticated-looking state. Also, rotating a password/secret does not retroactively affect an already-published deployment; the app must be redeployed for the new secret value to take effect in production.
