const { Pool } = require('pg');
const { env } = require('./env');

function parseDatabaseUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port || '5432',
      user: decodeURIComponent(u.username || ''),
      database: (u.pathname || '').replace(/^\//, '') || 'postgres',
    };
  } catch {
    return { host: '(unparseable DATABASE_URL)', port: '', user: '', database: '' };
  }
}

function needsSsl(connectionString, host) {
  if (env('DB_SSL') === 'false') return false;
  if (env('DB_SSL') === 'true') return true;
  if (env('NODE_ENV') === 'production') return true;
  const target = `${connectionString || ''} ${host || ''}`;
  return /supabase|render\.com|amazonaws|neon\.tech/i.test(target);
}

const databaseUrl = env('DATABASE_URL');
const dbHost = env('DB_HOST');
const ssl = needsSsl(databaseUrl, dbHost) ? { rejectUnauthorized: false } : false;

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl,
    }
  : {
      host: dbHost,
      port: env('DB_PORT') || 5432,
      database: env('DB_NAME'),
      user: env('DB_USER'),
      password: env('DB_PASSWORD'),
      ssl,
    };

const meta = databaseUrl
  ? parseDatabaseUrl(databaseUrl)
  : {
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
      database: poolConfig.database,
    };

console.log(
  `[DB] Connecting as user="${meta.user || '(default postgres)'}" host=${meta.host}:${meta.port} db=${meta.database} ssl=${!!ssl} via=${databaseUrl ? 'DATABASE_URL' : 'DB_HOST/DB_USER'}`
);

if (env('NODE_ENV') === 'production' && (meta.user === 'postgres' || !meta.user)) {
  console.warn(
    '[DB] Production is using user "postgres". If this database is Supabase pooler, DB_USER must be postgres.<project-ref>, not postgres. If Render attached its own Postgres, DATABASE_URL may be overriding your Supabase settings — unset Render\'s DATABASE_URL or paste the Supabase URI (password URL-encoded).'
  );
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;
