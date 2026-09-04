const { Queue, Worker } = require('bullmq');
const pool = require('../config/db');
const NotificationService = require('../services/NotificationService');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

const notificationQueue = new Queue('NotificationQueue', { connection });

// Schedule the daily cron job (runs at 8:00 AM every day)
async function scheduleDailyNotifications() {
  await notificationQueue.add('dailySeatAlerts', {}, {
    repeat: { pattern: '0 8 * * *' } // 8 AM Daily
  });
  console.log('✅ BullMQ: Daily Seat Alerts job scheduled.');
}

const notificationWorker = new Worker('NotificationQueue', async job => {
  if (job.name === 'dailySeatAlerts') {
    console.log('🔄 Running Daily Seat Alerts job...');
    
    // 1. Get all trips scheduled for today
    const tripsRes = await pool.query(`
      SELECT t.id, t.route_id, t.departure_time, t.available_seats, r.name as route_name 
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE DATE(t.departure_time) = CURRENT_DATE AND t.status = 'scheduled'
    `);
    const trips = tripsRes.rows;
    for (const trip of trips) {
      if (trip.available_seats <= 0) continue;

      // 2. Find frequent users for this trip's route
      const usersRes = await pool.query(
        'SELECT user_id FROM user_frequent_routes WHERE route_id = $1 AND booking_count >= 2',
        [trip.route_id]
      );

      const formattedTime = new Date(trip.departure_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const message = `A trip for ${trip.route_name} is scheduled for ${formattedTime} today with ${trip.available_seats} seats available. Book now!`;

      for (const row of usersRes.rows) {
        // Only notify if they haven't booked this trip yet
        const bookedRes = await pool.query(
          'SELECT id FROM bookings WHERE user_id = $1 AND trip_id = $2 AND status IN ($3, $4)', 
          [row.user_id, trip.id, 'confirmed', 'checked_in']
        );
        if (bookedRes.rows.length === 0) {
          await NotificationService.sendToUser(
            row.user_id, 
            'Seat Available! 🚌', 
            message, 
            { type: 'daily_alert', tripId: String(trip.id) }
          );
        }
      }
    }
  }
}, { connection });

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

module.exports = { scheduleDailyNotifications };
