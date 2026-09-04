# Spec: Mobile Auth Center + Production Deployment Setup

## Problem

Two high-priority items are blocking user experience and release readiness:

1. **Auth page vertical alignment on mobile**: The `Login` and `Register` pages position their form cards toward the top of the mobile viewport (`alignItems: 'flex-start'`), producing noticeable dead space below the card on taller mobile screens. The user requested the containers be placed "in the middle of the mobile screen."

2. **Production readiness gaps**: The project currently runs successfully in local development but has several hardcoded assumptions, loose configuration, and missing hardening that block a reliable deployment. No production environment files, build validation, security headers, backend hardening, or deployment scripts are in place.

## Users

- **End users (students/staff)**: Interact with the web-app Login/Register/Forgot Password/Set New Password flows on mobile and desktop.
- **DevOps / project maintainer**: Deploys the frontend and backend and must have a reproducible, documented, verified production build.

## Goals

1. Vertically center all four auth-page cards on mobile viewports (`≤ 520px`) while preserving current desktop layout and scroll behavior for very short viewports.
2. Bring the monorepo to a "deployable" production state:
   - Environment variables separated cleanly between dev/production for both frontend and backend.
   - Vite build is deterministic, reproducible, and passes `tsc -b` with zero diagnostics.
   - Backend is hardened with security headers, compression, production logging, and configurable CORS via env.
   - Firebase Hosting configuration is validated and safe.
   - One-click build/test scripts are available.

## Non-Goals

- No new features (auth logic, booking flows, UI components beyond styling tweaks).
- No rewrite of the backend to TypeScript / Nest / another framework.
- No database schema changes or migration scripts.
- No mobile-app (bus-app) changes; scope is web-app frontend and Node backend only.
- No CI/CD pipeline definition (GitHub Actions, etc.) unless required for a local production build.
- No DNS / custom domain configuration.

## Functional Requirements

### FR-1 Auth Page Mobile Centering (web-app)
- `Login.tsx`: Card is vertically centered on viewports ≤ 520px wide; on very short viewports the card still scrolls without clipping its top edge.
- `Register.tsx`: Same behavior as Login.
- `ForgotPassword.tsx`: Already uses `alignItems: 'center'`; verify consistent behavior and padding parity with Login/Register on mobile.
- `SetNewPassword.tsx`: Same verification as ForgotPassword.
- All four pages keep existing desktop behavior (desktop ≥ 521px remains `alignItems: flex-start` / current behavior unchanged).
- No console warnings or React key warnings introduced.

### FR-2 Frontend Production Build
- `.env.production` created in `frontend/web-app/` with:
  - `VITE_API_BASE_URL` (absolute backend URL, not the dev proxy `/api`).
  - `VITE_GOOGLE_CLIENT_ID` placeholder (if currently relied on implicitly).
  - All other `VITE_*` values currently loaded only via `.env`.
- `.env.development` created or normalized alongside `.env.production` so `loadEnv` resolves correctly for both modes.
- `vite.config.ts` production build determinism: explicit `build.target`, sourcemaps disabled in prod unless opted in, asset filename hashing.
- `npm run build` in `frontend/web-app` completes with:
  - `tsc -b` exit code 0, zero diagnostics.
  - `vite build` exit code 0, emits `dist/` matching `firebase.json` public dir.
- `firebase.json` validated: `public` matches dist output, rewrites SPA fallback still works, header rules for `index.html` / service worker are preserved.
- Service worker env injection plugin runs at build time without errors.

### FR-3 Backend Production Hardening
- `.env.production` (or documented env vars) for `backend/` covering:
  - `PORT`, `NODE_ENV=production`.
  - `FRONTEND_URL` (the deployed frontend origin, pushed into CORS whitelist).
  - `DATABASE_URL` / PG vars, `REDIS_URL`.
  - `JWT_SECRET` (required — warn if missing in prod).
  - Email / Gmail SMTP vars, Firebase admin SDK vars, SSLCommerz vars.
- `server.js` production hardening:
  - CORS whitelist: honor `FRONTEND_URL` + also allow comma-separated `CORS_ORIGINS` list for multi-origin setups.
  - Security middleware: add `helmet` for HTTP response headers, `compression` for gzip responses (only in prod, or always).
  - Production-specific logging: replace emoji-containing console logs with bracketed-tag logs (`[Server]`, `[DB]`) where still present, consistent with project conventions.
  - Graceful shutdown: on `SIGINT` / `SIGTERM`, close HTTP server, release PG pool, disconnect Redis, then `process.exit(0)`.
  - `NODE_ENV=production` disables verbose debug logs but keeps errors/warnings.
- Backend startup fails fast with a clear message in production if any required env var is missing (DB, JWT_SECRET at minimum).
- `package.json` scripts: `start:prod` alias or documented `NODE_ENV=production node src/server.js`.

### FR-4 Deployment Validation Scripts
- Root-level or per-package scripts that a maintainer can run:
  - Frontend: `npm run build` (already exists) + optional `npm run preview` to smoke-test the built SPA locally.
  - Backend: `npm run start:prod` + optional `npm run doctor` script (or a section in docs) that checks connectivity to DB and Redis before listening.
- Documented "pre-deploy checklist" in spec tasks (not a new README file) covering env setup, build, smoke tests.

## Non-Functional Requirements

### NFR-1 Security
- No hardcoded secrets, client IDs, or tokens committed in source files. Placeholders must use env vars.
- CORS in production must be explicit allow-list, not `*` / localhost wildcard.
- Backend disables `X-Powered-By` header in production.

### NFR-2 Reproducibility
- Fresh `git clone` + `npm ci` + correct `.env` files produces identical behavior in dev and prod builds across two consecutive runs on the same machine.

### NFR-3 Performance
- Frontend production build emits hashed asset filenames and long-term cache headers (Firebase headers already cover this; validate the hashing actually occurs).
- Backend responses use gzip/brotli compression for JSON and static assets (if any).

### NFR-4 Observability
- Backend startup prints a single [Server] line with env (prod/dev), port, and NODE_ENV.
- Backend errors in API handlers log to stderr but do not expose stack traces in HTTP responses to clients when `NODE_ENV=production`.

## Constraints

- User preference: 2px border-radius preference is preserved across UI components (auth pages should not use > 12px radius without reason; current 12px / 16px radii are acceptable since request only affects centering).
- Logging: backend logs use bracketed tags (`[Auth]`, `[Server]`, etc.) consistent with project_memory; emojis in production log lines should be replaced with bracketed tags.
- Port / origin: Password reset email links continue to use client-provided `frontendOrigin` from `ForgotPassword.tsx` (no regression).
- Reset routes remain whitelisted in the API 401 interceptor (already done).
- All user-facing times remain 12-hour `en-US` format (per project_memory — verify no regressions; not in scope to change).

## Dependencies / Assumptions

- Deployment target for frontend is Firebase Hosting (`firebase.json` already exists).
- Backend deployment target is a generic Node.js host (Render, Railway, EC2, Heroku-style); no provider-specific code beyond env vars.
- Postgres DB and Redis already exist for production; spec only requires env var wiring, not provisioning.
- Google OAuth client ID, Gmail SMTP credentials, SSLCommerz credentials, and Firebase admin credentials will be supplied by the maintainer via `.env` files.
- Maintainer has the Firebase CLI installed if they intend to deploy hosting from this machine.

## Open Questions

1. What is the production backend URL that `VITE_API_BASE_URL` should point to? (Required before deployment; acceptable as a placeholder value that maintainer fills in.)
2. Will the backend be hosted on the same domain as the frontend under a `/api` path, or on a separate subdomain? Affects whether we keep relative `/api` or always use absolute URL in prod. Assumption for this spec: separate origin, use absolute `VITE_API_BASE_URL`.

## Acceptance Criteria

### Rule AC-1
When the browser viewport is ≤ 520px wide AND ≥ 560px tall, Login page card is visually centered both vertically and horizontally, with roughly equal spacing above and below the card.

### Rule AC-2
Same visual centering on Register, ForgotPassword, SetNewPassword pages under the same viewport conditions.

### Rule AC-3
On viewports shorter than the card natural height, the card scrolls with the page without clipping its top content (no content hidden behind a fixed header or above the viewport top).

### Rule AC-4
`npm run build` in `frontend/web-app/` exits 0 with zero TypeScript diagnostics and emits a `dist/` directory.

### Rule AC-5
Frontend production build asset filenames include content hashes (verify one JS/CSS filename in `dist/assets/` matches pattern `*.[hash].js` / `*.[hash].css`).

### Rule AC-6
Backend starts successfully with `NODE_ENV=production`; logs contain `[Server]` startup tag, no emoji characters in startup-related logs, and the server listens on the configured `PORT`.

### Rule AC-7
Backend CORS rejects a request from a non-whitelisted origin in `NODE_ENV=production` (returns 500 or CORS error), but accepts requests from `FRONTEND_URL`.

### Rule AC-8
Backend responds to an unknown route in production with a generic error and does NOT leak the Express stack trace to the HTTP client body.

### Rule AC-9
All four auth pages render without React warnings/errors in console after the change.

### Rubric AC-10 (Mobile layout quality, 0-2)
- `0`: Cards still top-aligned on mobile OR content clips on short screens.
- `1`: Cards centered on mobile but with inconsistent padding across the four auth pages.
- `2`: All four auth pages are consistently centered on mobile, equal visual weight, padding parity, no regression on desktop. (Threshold: 2)

### Rubric AC-11 (Prod readiness completeness, 0-2)
- `0`: Missing > 2 of: env separation, security headers, compression, CORS config, startup hardening.
- `1`: Core items present but either no graceful shutdown, no missing-env fail-fast, or no production logging polish.
- `2`: Every functional requirement (FR-2, FR-3, FR-4) is implemented and evidenced by code + successful build/server start. (Threshold: ≥ 2)
