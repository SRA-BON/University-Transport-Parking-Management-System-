const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db');
const { connectRedis } = require('./config/redis');
const { scheduleDailyNotifications } = require('./workers/NotificationWorker');

const app = express();
const PORT = process.env.PORT || 5000;

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
];

if (process.env.FRONTEND_URL) {
  CORS_WHITELIST.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed =
      CORS_WHITELIST.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.endsWith('.expo.app') ||
      origin.endsWith('.loca.lt') ||
      origin.endsWith('.ngrok.io') ||
      origin.endsWith('.ngrok-free.app');
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

// Test Route
app.get('/', (req, res) => {
  res.json({ message: 'BRAC University Transport Management System API' });
});

// Test Database Connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Import and Register Routes
const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const tripRoutes = require('./routes/tripRoutes');
const routeRoutes = require('./routes/routeRoutes');
const rfidRoutes = require('./routes/rfidRoutes');
const parkingRoutes = require('./routes/parkingRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/admin', adminRoutes);


// ── Background no-show sweep (runs every 60 seconds) ──────────────────────
function startNoShowSweep() {
  const NO_SHOW_SWEEP_MS = 60 * 1000; // every minute
  const Booking = require('./models/Booking');

  console.log(`⏰ Background no-show sweep scheduled (every ${NO_SHOW_SWEEP_MS / 1000}s)`);

  const runSweep = async () => {
    try {
      const result = await Booking.processAllDueNoShows();
      if (result.checked_trips > 0) {
        const totalProcessed = (result.results || []).reduce(
          (acc, r) => acc + (r.result && r.result.processed ? r.result.processed : 0),
          0
        );
        if (totalProcessed > 0) {
          console.log(
            `⏰ No-show sweep completed — checked ${result.checked_trips} trips, marked ${totalProcessed} no-shows`
          );
        }
      }
    } catch (e) {
      console.error('⏰ No-show sweep error:', e.message);
    }
  };

  // Run once after server startup (staggered)
  setTimeout(runSweep, 15 * 1000);
  // Then every interval
  setInterval(runSweep, NO_SHOW_SWEEP_MS);
}

// Start Server
const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    // Start Express
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startNoShowSweep();
    });

    // Start background workers
    scheduleDailyNotifications().catch(err => console.error('Failed to schedule daily notifications:', err));
    
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

module.exports = app;
