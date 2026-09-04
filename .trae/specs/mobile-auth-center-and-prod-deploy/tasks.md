# Tasks: Mobile Auth Center + Production Deployment Setup

## Scope

Maps each Acceptance Criterion from `spec.md` to implementation work. Tasks are atomic, dependency-ordered vertical slices.

| Priority | Tasks in order |
|---|---|
| High | 1, 2, 3, 4, 5, 6, 7 |
| Medium | 8, 9 |

---

## Task 1: Center Login & Register cards on mobile (frontend/web-app)

**Scope:**
- `frontend/web-app/src/pages/Login.tsx`
- `frontend/web-app/src/pages/Register.tsx`

**Description:**
Update `getRootStyles()` in both pages so that on mobile (`isMobile === true`) the flex container uses `alignItems: 'center'` instead of `'flex-start'`. To prevent top clipping on very short viewports (card taller than the viewport), replace the simple `alignItems + justifyContent` pattern with a min-height flex container that allows the card to grow beyond the viewport and still scroll naturally. A well-established pattern is:

```
display: flex;
align-items: center;
justify-content: center;
min-height: 100vh;
min-height: 100dvh;
padding: <top-bottom> <left-right>;
```

…combined with `margin-block: auto` on the card as a fallback for very short content, or switch to `align-items: safe center`. Additionally apply this same logic consistently on desktop if the viewport is extremely short (but keep desktop `alignItems: flex-start` by default for normal-height screens).

**Acceptance Criteria covered:**
- AC-1, AC-2, AC-3, AC-9

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T1.1 | rule | Browser viewport 390×844 (mobile) → Login card is centered vertically; distance above card ≈ distance below card within 12px. |
| T1.2 | rule | Browser viewport 390×400 (very short mobile) → Login page scrolls; top of card can be scrolled into view with no hidden content above. |
| T1.3 | rule | Browser viewport 1280×800 (desktop) → Login card keeps `alignItems: flex-start` behavior (card in upper portion, not forced middle). |
| T1.4 | rule | Same 3 checks repeated for Register page. |
| T1.5 | rule | No React console warnings during page load or interaction on either page. |

**Depends on:** none.

**Status:** pending

---

## Task 2: Normalize ForgotPassword & SetNewPassword root/card padding parity on mobile

**Scope:**
- `frontend/web-app/src/pages/ForgotPassword.tsx`
- `frontend/web-app/src/pages/SetNewPassword.tsx`

**Description:**
These two pages already use `alignItems: center`. However:
1. They do not track `isMobile` and do not reduce padding for small screens like Login/Register do.
2. Their card `padding: '36px 30px'` is overly generous on ≤ 520px viewports.
3. They use an inline gradient background that differs from Login/Register (which use `var(--bg-primary)` CSS variable via `data-theme="light"`). Match the approach across the set: keep `data-theme="light"` on both, swap gradient root background to CSS vars, and add mobile-specific padding / card max-width parity with Login (`max-width: 100%` on mobile, `padding: 20px 16px` on card).

**Acceptance Criteria covered:**
- AC-2, AC-9, AC-10 (rubric)

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T2.1 | rule | ForgotPassword mobile (390×844): card padding is visually consistent with Login page on same viewport. |
| T2.2 | rule | SetNewPassword mobile (390×844): same as above. |
| T2.3 | rule | ForgotPassword desktop: behavior unchanged (still centered, card max 420, outer padding 20px). |
| T2.4 | rule | SetNewPassword desktop: same as above, and all three states (validating, invalid link, form) render correctly. |

**Depends on:** none (Task 1 and Task 2 are independent and may run concurrently, but must both be complete before AC-10 rubric is evaluated).

**Status:** pending

---

## Task 3: Frontend env separation + Vite production build config

**Scope:**
- `frontend/web-app/.env.production` (create)
- `frontend/web-app/.env.development` (create or normalize from existing `.env` if present)
- `frontend/web-app/vite.config.ts`

**Description:**
1. Create `.env.production` with placeholders for:
   - `VITE_API_BASE_URL` (absolute backend URL, empty placeholder with clear comment)
   - `VITE_GOOGLE_CLIENT_ID` (placeholder, required for Google OAuth)
   - `VITE_PORT` (5173 default for preview)
   - Any Firebase FCM `VITE_*` variables currently consumed in `firebase.ts` or the service worker.
2. Create `.env.development` mirroring the same keys but with dev-appropriate values (relative `/api` proxy for `VITE_API_BASE_URL`).
3. Update `vite.config.ts`:
   - Add explicit `build.target: 'es2020'` or compatible target.
   - Add `build.sourcemap: false` in production (keep dev default).
   - Ensure asset filenames include content hash (Vite default uses `[name]-[hash][extname]` for `build.rollupOptions.output.assetFileNames/chunkFileNames/entryFileNames`; confirm or set explicitly).
4. Verify both `firebase-messaging-sw.js` placeholders `__VITE_*__` are still replaced by the plugin at build time.

**Acceptance Criteria covered:**
- AC-4, AC-5

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T3.1 | rule | `cd frontend/web-app && npm run build` → exit code 0, `tsc -b` no errors. |
| T3.2 | rule | `frontend/web-app/dist/assets/` contains at least one `.js` and one `.css` file whose filenames include a hash segment (e.g. `index-d9a8b3f2.js`). |
| T3.3 | rule | `.env.production` file exists and lists all `VITE_*` vars used by the app (cross-reference `import.meta.env.VITE_` occurrences in src/). |
| T3.4 | rule | Service worker placeholder injection: `public/firebase-messaging-sw.js` after buildStart contains no `__VITE_` tokens as literal strings. |

**Depends on:** none.

**Status:** pending

---

## Task 4: Backend env separation + fail-fast validation + production CORS

**Scope:**
- `backend/src/server.js`
- `backend/src/config/db.js` (read-only, no changes unless we find missing vars)
- `backend/src/config/redis.js` (read-only)
- New: optional `backend/src/config/env.js` helper module
- New: `backend/.env.production` example structure (file creation)

**Description:**
1. At the top of `server.js` (or a new small `env.js` require'd first), add a required-env validator that runs when `NODE_ENV === 'production'`. Required vars: `JWT_SECRET`, at least one of `DATABASE_URL` / (`PGHOST` + `PGUSER` + `PGPASSWORD` + `PGDATABASE`), and `FRONTEND_URL`. If any are missing, log `[Server] FATAL: missing required env vars: X,Y,Z` and `process.exit(1)`.
2. Update CORS config:
   - Honor `FRONTEND_URL` (already there).
   - Also support a comma-separated `CORS_ORIGINS` env var (splits on `,`, trims, adds to whitelist).
   - In `NODE_ENV=production`, REMOVE the broad `localhost` / `127.0.0.1` wildcard checks; keep only explicit whitelist origins.
   - In non-production (dev), keep localhost wildcard for convenience.
3. Remove `X-Powered-By`: add `app.disable('x-powered-by')` early in `server.js` (for all environments, safe).

**Acceptance Criteria covered:**
- AC-6, AC-7

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T4.1 | rule | `NODE_ENV=production JWT_SECRET='' node -e "require('./src/server.js')"` (or equivalent) exits non-zero with a `[Server] FATAL` log line. |
| T4.2 | rule | `NODE_ENV=production` + all required env vars set: server starts, logs `[Server]` line with port and `env: production`. |
| T4.3 | rule | Production-mode CORS: request from `Origin: https://evil.example` triggers a CORS error (response lacks `access-control-allow-origin` or returns the CORS `Not allowed` error). |
| T4.4 | rule | Production-mode CORS: request whose `Origin` matches `FRONTEND_URL` exactly succeeds and includes `access-control-allow-origin` header. |

**Depends on:** none (runs concurrently with frontend env work).

**Status:** pending

---

## Task 5: Backend hardening — helmet, compression, production error handling, graceful shutdown

**Scope:**
- `backend/package.json` (add `helmet`, `compression` deps)
- `backend/src/server.js` (wire up middleware + error handler + shutdown)

**Description:**
1. Install (add to `dependencies`): `helmet@latest`, `compression@latest`.
2. Register middleware order in `server.js`:
   - `helmet()` with CSP permissive enough for BRACU logo CDN (add `img-src` directive allowing `www.bracu.ac.bd` origins).
   - `compression()` (before routes).
   - CORS, then JSON parser, then routes.
3. Add an **error-handling middleware** at the end (after all routes, 4-arity `(err, req, res, next)`). Behavior:
   - Log `[Server] ERROR: <msg>` + stack (stderr).
   - In `production`: respond `{ error: 'Internal Server Error' }` with `status: err.statusCode || 500`, never include `err.stack` in body.
   - In `development`: respond `{ error: err.message, stack: err.stack }` for convenience.
4. Add graceful shutdown handlers:
   - Register `process.on('SIGINT', shutdown)` and `process.on('SIGTERM', shutdown)`.
   - `shutdown()`: log `[Server] shutting down…`, call `server.close()`, then `pool.end()` (from `./config/db`), then Redis disconnect (from `./config/redis`, expose a `disconnectRedis` if not available), then `process.exit(0)` after timeout fallback.

**Acceptance Criteria covered:**
- AC-6, AC-8, NFR-1, NFR-3, NFR-4

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T5.1 | rule | GET `/` in production mode returns response headers that include `Content-Encoding: gzip` (or `br`) AND do NOT include `X-Powered-By: Express`. |
| T5.2 | rule | Helmet headers present: at minimum `X-Content-Type-Options: nosniff` is visible on HTTP response. |
| T5.3 | rule | Throw a test error in a temporary test route (or by stopping DB mid-request). In production-mode response body, JSON does not contain the substring `at ` (stack frame). |
| T5.4 | rubric | Graceful shutdown quality (0-2). Scale: `0` no shutdown handlers; `1` handlers present but missing pool or Redis; `2` server.close + pool.end + Redis disconnect all wired. Threshold: ≥ 2. |

**Depends on:** Task 4 (because CORS logic interacts with middleware order).

**Status:** pending

---

## Task 6: Backend production logging polish (bracketed tags, emoji removal)

**Scope:**
- `backend/src/server.js`
- `backend/src/workers/NotificationWorker.js`
- Scan of all `backend/src/**/*.js` for `console.log` lines with emojis

**Description:**
Project convention (per project_memory) says logs use bracketed tags like `[Parking]`, `[Server]`, `[Auth]` instead of emojis. For production readiness:
1. Replace every emoji-containing `console.log` call in `server.js` startup lines with bracketed-tag equivalents (keeping informational content). In particular, the no-show sweep and trip-status sweep lines currently start with ⏰. Replace `⏰` with `[Scheduler]`.
2. Do NOT change error paths / stack traces; only human-readable info/warn log lines.
3. Add a `NODE_ENV` check for verbose debug logs: wrap any `console.log` that is clearly debug-only (e.g. per-request detail) inside `if (process.env.NODE_ENV !== 'production')`.

**Acceptance Criteria covered:**
- AC-6, NFR-4, project_memory conventions

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T6.1 | rule | `NODE_ENV=production` start-up log lines contain zero emoji code points (check `server.js`). |
| T6.2 | rule | All no-show sweep and trip-sweep log lines start with `[Scheduler]` bracket tag. |
| T6.3 | rule | `NODE_ENV=development` still emits verbose logs (if there were any before). |

**Depends on:** none (concurrent with Task 5).

**Status:** pending

---

## Task 7: Backend scripts — start:prod + package.json polish

**Scope:**
- `backend/package.json`

**Description:**
Add the following scripts to backend `package.json`:
- `"start:prod": "NODE_ENV=production node src/server.js"` (cross-platform note: document that Windows users use `set NODE_ENV=production&& node src/server.js` or `cross-env` if they need it; we do NOT add `cross-env` dep unless user asks — just add the script with a comment in tasks.md evidence — scripts JSON doesn't support comments, so put notes in task's completion evidence).
- Optionally add `"doctor": "node -e \"require('./src/config/db').query('SELECT 1').then(()=>console.log('[Doctor] DB OK')).catch(e=>{console.error('[Doctor] DB FAIL:',e.message);process.exit(1)})\""` — keep lightweight.

**Acceptance Criteria covered:**
- FR-4

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T7.1 | rule | `npm run start:prod` (with correct env vars) boots the server and log output shows `NODE_ENV` = production. |
| T7.2 | rule | `npm run doctor` succeeds when DB is reachable and exits non-zero otherwise. |

**Depends on:** none.

**Status:** pending

---

## Task 8: Firebase hosting validation + frontend preview smoke test

**Scope:**
- `firebase.json` (read-only validate)
- `frontend/web-app/dist/` output

**Description:**
No edits unless validation finds issues. Validation checklist:
1. `firebase.json.public === "frontend/web-app/dist"` matches vite `build.outDir` default (`dist`). ✓ known-good from earlier read.
2. SPA rewrite exists: `** -> /index.html`. ✓.
3. Headers:
   - `index.html` → `Cache-Control: no-cache`. ✓.
   - Hashed assets (`*.js|css|png|jpg|svg|ico|woff2`) → long cache + immutable. ✓.
   - Service worker → `Cache-Control: no-cache` + `Service-Worker-Allowed: /`. ✓.
4. Build `dist/` and confirm there are no broken references: open one built `index.html` and see all `<link href=...>` and `<script src=...>` point at files that actually exist in `dist/`.

**Acceptance Criteria covered:**
- FR-2

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T8.1 | rule | After `npm run build`, every `<script src>` and `<link rel=stylesheet>` in generated `dist/index.html` resolves to a file present on disk under `dist/`. |
| T8.2 | rule | `firebase.json` contains no obvious blockers (SPA rewrite, public dir match). |

**Depends on:** Task 3 (needs dist/ output).

**Status:** pending

---

## Task 9: Full end-to-end smoke verification

**Scope:**
- Full workspace: build frontend, start backend prod, hit a few endpoints.

**Description:**
Single-command flows on a clean terminal:
1. Frontend: `cd frontend/web-app && npm run build` → passes.
2. Backend: set env vars → `npm run start:prod` → boots, DB + Redis connected.
3. API smoke test:
   - `curl <backend>/` → 200 JSON welcome message.
   - `curl <backend>/api/test-db` → 200 with DB timestamp.
   - POST to `/api/auth/forgot-password` returns 200 (generic success message, per account-enum prevention rule in project_memory).
4. Frontend preview: `npm run preview` → serves built dist.
5. Navigate to Login/Register/Forgot/Reset pages in preview and verify no console errors.

**Acceptance Criteria covered:**
- AC-4, AC-6, and cross-cutting evidence for AC-1 through AC-9.

**Test Requirements:**

| ID | Type | Test |
|---|---|---|
| T9.1 | rule | Backend prod mode boots without uncaught exceptions. |
| T9.2 | rule | Frontend build + preview serves Login page without 404s for its assets. |
| T9.3 | rule | Forgot-password endpoint returns generic success message (per project_memory "generic non-disclosure messages for forgot-password responses to prevent account enumeration"). |
| T9.4 | rule | All auth pages (Login, Register, Forgot, Reset) on preview mobile viewport show centered cards with zero React console errors. |

**Depends on:** Tasks 1, 2, 3, 4, 5, 6, 7, 8.

**Status:** pending

---

## AC Coverage Matrix

| AC | Primary task(s) |
|---|---|
| AC-1 | Task 1 |
| AC-2 | Task 1, Task 2 |
| AC-3 | Task 1 |
| AC-4 | Task 3, Task 9 |
| AC-5 | Task 3 |
| AC-6 | Task 4, Task 5, Task 6, Task 7 |
| AC-7 | Task 4 |
| AC-8 | Task 5 |
| AC-9 | Task 1, Task 2, Task 9 |
| AC-10 (rubric) | Task 1 + Task 2 combined |
| AC-11 (rubric) | Tasks 3, 4, 5, 6, 7 combined |
