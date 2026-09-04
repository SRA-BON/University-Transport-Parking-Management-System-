require('dotenv').config();

function stripQuotes(value) {
  if (value == null) return value;
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function env(key, fallback) {
  const raw = process.env[key];
  if (raw == null || String(raw).trim() === '') return fallback;
  return stripQuotes(raw);
}

// Same Web client as frontend VITE_GOOGLE_CLIENT_ID / main.tsx fallback
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '650927723892-4rhgmk09sl6ppe8ofso7i6pb7i73clrs.apps.googleusercontent.com';

function googleAudiences() {
  const extra = env('GOOGLE_CLIENT_IDS', '') || '';
  const ids = [
    env('GOOGLE_CLIENT_ID'),
    DEFAULT_GOOGLE_WEB_CLIENT_ID,
    ...extra.split(','),
  ]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

module.exports = { env, stripQuotes, googleAudiences };
