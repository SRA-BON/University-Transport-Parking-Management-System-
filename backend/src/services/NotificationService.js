const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const pool = require('../config/db');

// Initialize Firebase Admin (Only if env vars are provided)
let isFirebaseInitialized = false;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    isFirebaseInitialized = true;
    console.log('✅ Firebase Admin SDK Initialized for FCM');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', err);
  }
} else {
  console.warn('⚠️ Firebase Admin SDK not initialized. FCM Notifications will be logged instead of sent.');
}

class NotificationService {
  /**
   * Save a user's FCM device token
   */
  static async registerToken(userId, deviceToken, deviceType = 'web') {
    const query = `
      INSERT INTO fcm_tokens (user_id, device_token, device_type) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (device_token) 
      DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
    `;
    await pool.query(query, [userId, deviceToken, deviceType]);
  }

  /**
   * Track a user's route usage
   */
  static async trackFrequentRoute(userId, routeId) {
    const query = `
      INSERT INTO user_frequent_routes (user_id, route_id) 
      VALUES ($1, $2)
      ON CONFLICT (user_id, route_id) 
      DO UPDATE SET booking_count = user_frequent_routes.booking_count + 1, last_booked_at = NOW()
    `;
    await pool.query(query, [userId, routeId]);
  }

  /**
   * Send push notification to a specific user
   */
  static async sendToUser(userId, title, body, data = {}) {
    const result = await pool.query('SELECT device_token FROM fcm_tokens WHERE user_id = $1', [userId]);
    const tokens = result.rows.map(r => r.device_token);

    if (tokens.length === 0) {
      console.log(`🔕 User ${userId} has no FCM tokens registered. Skipping notification: "${title}"`);
      return;
    }

    const payload = {
      notification: { title, body },
      data: { ...data, timestamp: String(Date.now()) },
      tokens
    };

    if (isFirebaseInitialized) {
      try {
        const response = await getMessaging().sendEachForMulticast(payload);
        console.log(`📲 FCM Notification Sent to User ${userId}: ${response.successCount} successes, ${response.failureCount} failures`);
      } catch (err) {
        console.error(`❌ FCM Send Error (User ${userId}):`, err);
      }
    } else {
      console.log(`[SIMULATED FCM] Push to User ${userId}:`, title, '-', body);
    }
  }

  /**
   * Predefined Notifications
   */
  static async notifyBookingConfirmed(userId, tripDetails) {
    await this.sendToUser(userId, 'Booking Confirmed! ✅', `Your booking for ${tripDetails.route_name} at ${new Date(tripDetails.departure_time).toLocaleTimeString()} is confirmed.`);
  }

  static async notifyBookingCancelled(userId, tripDetails, refundAmount) {
    await this.sendToUser(userId, 'Booking Cancelled ❌', `Your booking for ${tripDetails.route_name} was cancelled. Refund: ৳${refundAmount}`);
  }

  static async notifyPaymentSuccess(userId, amount) {
    await this.sendToUser(userId, 'Payment Successful 💳', `৳${amount} has been successfully added to your wallet.`);
  }

  static async notifySeatAvailabilityDrop(tripId, remainingSeats, routeName, departureTime) {
    if (remainingSeats !== 10 && remainingSeats !== 5) return;

    // Find users who frequently travel on this route
    const tripRes = await pool.query('SELECT route_id FROM trips WHERE id = $1', [tripId]);
    if (!tripRes.rows.length) return;
    const routeId = tripRes.rows[0].route_id;

    // Get top users for this route
    const usersRes = await pool.query(
      'SELECT user_id FROM user_frequent_routes WHERE route_id = $1 AND booking_count >= 2', 
      [routeId]
    );

    const formattedTime = new Date(departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const message = `Hurry! Only ${remainingSeats} seats left on the ${formattedTime} ${routeName} trip.`;

    for (const row of usersRes.rows) {
      // Avoid sending to users who ALREADY booked this specific trip
      const bookedRes = await pool.query(
        'SELECT id FROM bookings WHERE user_id = $1 AND trip_id = $2 AND status IN ($3, $4)', 
        [row.user_id, tripId, 'confirmed', 'checked_in']
      );
      if (bookedRes.rows.length === 0) {
        await this.sendToUser(row.user_id, 'Low Seats Alert! 🚌', message, { type: 'seat_alert', tripId: String(tripId) });
      }
    }
  }
}

module.exports = NotificationService;
