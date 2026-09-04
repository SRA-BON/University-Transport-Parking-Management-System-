/**
 * TripSchedulerWorker
 *
 * Runs a BullMQ cron job at midnight every day (0 0 * * *).
 * For each active trip_template it creates a trip for TOMORROW with:
 *   - departure_time = tomorrow at template.departure_hour:departure_minute
 *   - arrival_time   = departure_time + template.duration_minutes
 *   - booking_open_at = departure_time - route.booking_window_minutes
 *   - status = 'pending'   (the lifecycle sweep opens booking automatically)
 *
 * Skips creation if a trip already exists for that bus/route on that day
 * (idempotent — safe to call multiple times).
 */

const { Queue, Worker } = require('bullmq');
const pool = require('../config/db');
const { client: redisClient } = require('../config/redis');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

const tripSchedulerQueue = new Queue('TripSchedulerQueue', { connection });

async function scheduleDailyTrips() {
  await tripSchedulerQueue.add('createDailyTrips', {}, {
    repeat: { pattern: '0 0 * * *' }, // midnight every day
  });
  console.log('? BullMQ: Daily trip creation job scheduled (midnight).');
}

const tripSchedulerWorker = new Worker('TripSchedulerQueue', async (job) => {
  if (job.name !== 'createDailyTrips') return;

  console.log('???  Running daily trip creation job...');

  // Tomorrow's date (server local time)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm   = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd   = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${yyyy}-${mm}-${dd}`;

  // Fetch all active templates with their route's booking_window_minutes
  const templatesRes = await pool.query(`
    SELECT
      tt.id,
      tt.bus_id,
      tt.route_id,
      tt.departure_hour,
      tt.departure_minute,
      tt.duration_minutes,
      b.capacity,
      b.standby_capacity,
      r.booking_window_minutes
    FROM trip_templates tt
    JOIN buses  b ON b.id = tt.bus_id
    JOIN routes r ON r.id = tt.route_id
    WHERE tt.is_active = TRUE
  `);

  let created = 0;
  let skipped = 0;

  for (const t of templatesRes.rows) {
    // Build departure/arrival timestamps
    const departureTime = new Date(
      `${tomorrowStr}T${String(t.departure_hour).padStart(2, '0')}:${String(t.departure_minute).padStart(2, '0')}:00`
    );
    const arrivalTime   = new Date(departureTime.getTime() + t.duration_minutes * 60 * 1000);
    const bookingOpenAt = new Date(departureTime.getTime() - t.booking_window_minutes * 60 * 1000);

    // Check if a trip already exists for this bus/route on this day (idempotent)
    const existsRes = await pool.query(`
      SELECT id FROM trips
      WHERE bus_id   = $1
        AND route_id = $2
        AND DATE(departure_time AT TIME ZONE 'UTC') = $3::date
    `, [t.bus_id, t.route_id, tomorrowStr]);

    if (existsRes.rows.length > 0) {
      skipped++;
      continue;
    }

    const insertRes = await pool.query(`
      INSERT INTO trips
        (bus_id, route_id, departure_time, arrival_time, booking_open_at,
         available_seats, available_standby, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id, available_seats, available_standby
    `, [
      t.bus_id,
      t.route_id,
      departureTime.toISOString(),
      arrivalTime.toISOString(),
      bookingOpenAt.toISOString(),
      t.capacity,
      t.standby_capacity,
    ]);

    const newTrip = insertRes.rows[0];

    // Prime Redis seat counters
    try {
      await redisClient.set(`trip:${newTrip.id}:seats:available`,  String(newTrip.available_seats));
      await redisClient.set(`trip:${newTrip.id}:standby:available`, String(newTrip.available_standby));
    } catch (_e) {
      // Redis optional – DB is the source of truth
    }

    created++;
  }

  console.log(`???  Daily trip creation: ${created} trip(s) created for ${tomorrowStr}, ${skipped} skipped (already existed).`);
}, { connection });

tripSchedulerWorker.on('failed', (job, err) => {
  console.error(`? TripSchedulerWorker job ${job?.id} failed:`, err.message);
});

module.exports = { scheduleDailyTrips };
