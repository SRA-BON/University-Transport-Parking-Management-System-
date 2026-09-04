const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();
const { stripQuotes } = require('./config/env');
const pool = require('./config/db');
const { connectRedis, client: redisClient, disconnectRedis } = require('./config/redis');
const { scheduleDailyNotifications } = require('./workers/NotificationWorker');

const isProd = process.env.NODE_ENV === 'production';

const REQUIRED_ENV_PROD = [
  { key: 'JWT_SECRET', label: 'JWT signing secret' },
  { key: 'FRONTEND_URL', label: 'Public frontend origin (CORS + emails)' },
];

function validateEnv() {
  const missing = REQUIRED_ENV_PROD.filter((r) => !stripQuotes(process.env[r.key]));
  const dbUrlOk = !!stripQuotes(process.env.DATABASE_URL);
  const dbPartsOk =
    stripQuotes(process.env.DB_HOST) &&
    stripQuotes(process.env.DB_USER) &&
    stripQuotes(process.env.DB_PASSWORD) &&
    stripQuotes(process.env.DB_NAME);
  if (!dbUrlOk && !dbPartsOk) {
    missing.push({ key: 'DATABASE_URL or DB_HOST+DB_USER+DB_PASSWORD+DB_NAME', label: 'PostgreSQL connection' });
  }
  return missing;
}
if (isProd) {
  const missing = validateEnv();
  if (missing.length > 0) {
    console.error(`[Server] FATAL: missing required env vars (NODE_ENV=production): ${missing.map((m) => `${m.key} (${m.label})`).join(', ')}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "https://www.gstatic.com", "https://maps.googleapis.com", "https://accounts.google.com"],
      'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      'font-src': ["'self'", "https://fonts.gstatic.com", "data:"],
      'img-src': ["'self'", "data:", "blob:", "https:", "http://*.bracu.ac.bd", "https://*.bracu.ac.bd"],
      'connect-src': ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://accounts.google.com", "wss:"],
      'frame-src': ["'self'", "https://accounts.google.com"],
      'worker-src': ["'self'", "blob:"],
      'media-src': ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

if (isProd) {
  app.use(compression());
}

const CORS_WHITELIST = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  // Production Firebase Hosting
  'https://uni-basement-system.web.app',
  'https://uni-basement-system.firebaseapp.com',
];

if (process.env.FRONTEND_URL) {
  CORS_WHITELIST.push(process.env.FRONTEND_URL);
}
if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => CORS_WHITELIST.push(o));
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    let allowed = CORS_WHITELIST.includes(origin);
    if (!allowed && !isProd) {
      allowed =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.endsWith('.expo.app') ||
        origin.endsWith('.loca.lt') ||
        origin.endsWith('.ngrok.io') ||
        origin.endsWith('.ngrok-free.app');
    }
    if (!allowed && isProd) {
      console.warn(`[Server] CORS blocked: origin=${origin}`);
    }
    callback(allowed ? null : new Error('Not allowed by CORS: ' + origin), allowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'BRAC University Transport Management System API', env: isProd ? 'production' : 'development' });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0].now });
  } catch (err) {
    console.error('[DB] test-db failed:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const tripRoutes = require('./routes/tripRoutes');
const routeRoutes = require('./routes/routeRoutes');
const rfidRoutes = require('./routes/rfidRoutes');
const parkingRoutes = require('./routes/parkingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const statusCode = Number(err.statusCode || err.status || 500) || 500;
  if (statusCode >= 500) {
    console.error(`[Server] ERROR ${req.method} ${req.path}:`, err.message || err);
    if (err.stack && !isProd) {
      console.error(err.stack);
    }
  }
  if (isProd) {
    const safeMessage =
      statusCode < 500 && err.message
        ? err.message
        : 'Internal Server Error';
    return res.status(statusCode).json({ error: safeMessage });
  }
  return res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    stack: err.stack,
  });
});

function startNoShowSweep() {
  const NO_SHOW_SWEEP_MS = 60 * 1000;
  const Booking = require('./models/Booking');

  console.log(`[Scheduler] No-show sweep scheduled (every ${NO_SHOW_SWEEP_MS / 1000}s)`);

  const runSweep = async () => {
    try {
      const result = await Booking.processAllDueNoShows();
      if (result.checked_trips > 0) {
        const totalProcessed = (result.results || []).reduce(
          (acc, r) => acc + (r.result && r.result.processed ? r.result.processed : 0),
          0
        );
        if (totalProcessed > 0) {
          console.log(`[Scheduler] No-show sweep — checked ${result.checked_trips} trips, marked ${totalProcessed} no-shows`);
        }
      }
    } catch (e) {
      console.error('[Scheduler] No-show sweep error:', e.message);
    }
  };

  setTimeout(runSweep, 15 * 1000);
  setInterval(runSweep, NO_SHOW_SWEEP_MS);
}

function startTripStatusSweep() {
  const TRIP_STATUS_SWEEP_MS = 60 * 1000;

  console.log(`[Scheduler] Trip status sweep scheduled (every ${TRIP_STATUS_SWEEP_MS / 1000}s)`);

  const runSweep = async () => {
    try {
      const pool = require('./config/db');
      const result = await pool.query(`
        UPDATE trips t
        SET status = 'scheduled', updated_at = CURRENT_TIMESTAMP
        FROM routes r
        WHERE t.route_id = r.id
          AND t.status = 'pending'
          AND NOW() >= t.departure_time - (r.booking_window_minutes || ' minutes')::interval
          AND t.departure_time > NOW()
        RETURNING t.id, t.route_id, t.departure_time
      `);
      if (result.rowCount > 0) {
        console.log(`[Scheduler] Trip status sweep: opened booking for ${result.rowCount} trips.`);
      }
    } catch (e) {
      console.error('[Scheduler] Trip status sweep error:', e.message);
    }
  };

  setTimeout(runSweep, 10 * 1000);
  setInterval(runSweep, TRIP_STATUS_SWEEP_MS);
}

let httpServer = null;
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  const forceExit = setTimeout(() => {
    console.error('[Server] Forcing exit after 10s timeout');
    process.exit(1);
  }, 10000);
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(() => resolve()));
      console.log('[Server] HTTP server closed');
    }
  } catch (e) {
    console.error('[Server] HTTP server close error:', e.message);
  }
  try {
    await pool.end();
    console.log('[DB] Pool closed');
  } catch (e) {
    console.error('[DB] Pool close error:', e.message);
  }
  try {
    if (typeof disconnectRedis === 'function') {
      await disconnectRedis();
    } else if (redisClient && typeof redisClient.quit === 'function') {
      await redisClient.quit();
    }
    console.log('[Redis] Disconnected');
  } catch (e) {
    console.error('[Redis] Disconnect error:', e.message);
  }
  clearTimeout(forceExit);
  console.log('[Server] Shutdown complete');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  if (err.stack) console.error(err.stack);
  shutdown('uncaughtException').catch(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason?.message || reason);
});

const startServer = async () => {
  try {
    try {
      await pool.query('SELECT 1');
      console.log('[DB] Connection OK');
    } catch (dbErr) {
      console.error('[DB] Connection failed at startup:', dbErr.message);
      console.error('[DB] Check Render env: use Supabase DATABASE_URL (URL-encode special characters in the password) or DB_USER=postgres.<project-ref> for the pooler. A Render Postgres DATABASE_URL with user "postgres" will override DB_* if both are set.');
    }
    await connectRedis();
    httpServer = app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT} · env=${isProd ? 'production' : 'development'}`);
      startNoShowSweep();
      startTripStatusSweep();
    });

    scheduleDailyNotifications().catch((err) => {
      console.error('[Notifier] Failed to schedule daily notifications:', err.message);
    });

  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
