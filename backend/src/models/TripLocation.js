const pool = require('../config/db');
const { client: redisClient } = require('../config/redis');

const REDIS_TTL_SECONDS = 30;

async function safeRedis(promise, fallback) {
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('REDIS_TIMEOUT')), 800)),
    ]);
  } catch (_e) {
    return fallback;
  }
}

class TripLocation {
  static async logLocation({ tripId, latitude, longitude, heading = null, speedKmh = null, accuracyMeters = null, updatedBy = null }) {
    if (!tripId || latitude == null || longitude == null) {
      throw new Error('tripId, latitude, and longitude are required');
    }
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (isNaN(latNum) || isNaN(lngNum)) {
      throw new Error('Invalid latitude or longitude');
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      throw new Error('Latitude or longitude out of valid range');
    }

    const result = await pool.query(
      `INSERT INTO trip_locations
         (trip_id, latitude, longitude, heading, speed_kmh, accuracy_meters, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tripId,
        latNum,
        lngNum,
        heading != null ? Number(heading) : null,
        speedKmh != null ? Number(speedKmh) : null,
        accuracyMeters != null ? Number(accuracyMeters) : null,
        updatedBy,
      ]
    );

    const location = result.rows[0];

    // Upsert the latest snapshot so getLatest() works without Redis
    await pool.query(
      `INSERT INTO trip_location_snapshots
         (trip_id, latitude, longitude, heading, speed_kmh, accuracy_meters, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (trip_id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         heading = EXCLUDED.heading,
         speed_kmh = EXCLUDED.speed_kmh,
         accuracy_meters = EXCLUDED.accuracy_meters,
         last_updated = NOW()`,
      [tripId, latNum, lngNum, heading != null ? Number(heading) : null,
       speedKmh != null ? Number(speedKmh) : null,
       accuracyMeters != null ? Number(accuracyMeters) : null]
    );

    try {
      const cacheKey = `trip:${tripId}:location:latest`;
      await safeRedis(
        redisClient.setEx(
          cacheKey,
          REDIS_TTL_SECONDS,
          JSON.stringify({
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            speed_kmh: location.speed_kmh,
            accuracy_meters: location.accuracy_meters,
            timestamp: location.created_at,
          })
        ),
        null
      );
    } catch (_e) {}

    return location;
  }

  static async getLatest(tripId) {
    const cacheKey = `trip:${tripId}:location:latest`;
    try {
      const cached = await safeRedis(redisClient.get(cacheKey), null);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          trip_id: tripId,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          heading: parsed.heading,
          speed_kmh: parsed.speed_kmh,
          accuracy_meters: parsed.accuracy_meters,
          last_updated: parsed.timestamp,
          _source: 'redis',
        };
      }
    } catch (_e) {}

    const result = await pool.query(
      `SELECT s.trip_id, s.latitude, s.longitude, s.heading, s.speed_kmh, s.accuracy_meters, s.last_updated
       FROM trip_location_snapshots s
       WHERE s.trip_id = $1`,
      [tripId]
    );

    if (!result.rows.length) {
      return null;
    }
    const loc = result.rows[0];

    try {
      await safeRedis(
        redisClient.setEx(
          cacheKey,
          REDIS_TTL_SECONDS,
          JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
            heading: loc.heading,
            speed_kmh: loc.speed_kmh,
            accuracy_meters: loc.accuracy_meters,
            timestamp: loc.last_updated,
          })
        ),
        null
      );
    } catch (_e) {}

    return { ...loc, _source: 'db' };
  }

  static async getHistory(tripId, limit = 100) {
    const result = await pool.query(
      `SELECT latitude, longitude, heading, speed_kmh, accuracy_meters, created_at
       FROM trip_locations
       WHERE trip_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tripId, Math.min(Math.max(limit, 1), 1000)]
    );
    return result.rows;
  }

  static async getActiveTripForUser(userId) {
    const result = await pool.query(
      `SELECT b.id AS booking_id, b.trip_id, b.status AS booking_status, b.seat_number, b.is_standby,
              t.departure_time, t.status AS trip_status, t.bus_id, t.route_id,
              r.name AS route_name, r.direction, r.classification,
              bu.bus_number
       FROM bookings b
       JOIN trips t ON b.trip_id = t.id
       JOIN routes r ON t.route_id = r.id
       JOIN buses bu ON t.bus_id = bu.id
       WHERE b.user_id = $1
         AND b.status IN ('confirmed', 'checked_in')
         AND t.status = 'in_progress'
       ORDER BY t.departure_time DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  static async getActiveInProgressTrips() {
    const result = await pool.query(
      `SELECT t.id AS trip_id, t.bus_id, t.route_id, t.departure_time, t.status,
              r.name AS route_name, r.direction, b.bus_number,
              s.latitude, s.longitude, s.heading, s.speed_kmh, s.accuracy_meters, s.last_updated
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       JOIN buses b ON t.bus_id = b.id
       LEFT JOIN trip_location_snapshots s ON s.trip_id = t.id
       WHERE t.status = 'in_progress'
       ORDER BY t.departure_time ASC`
    );
    return result.rows;
  }
}

module.exports = TripLocation;
