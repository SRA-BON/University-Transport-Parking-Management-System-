const pool = require('../config/db');
const { client: redisClient } = require('../config/redis');

/**
 * Execute a Redis op with a short timeout + graceful DB fallback so
 * a missing/down Redis never hangs a request for 15+ seconds.
 */
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

class Trip {
  static async create({ busId, routeId, departureTime, arrivalTime }) {
    const bus = await pool.query('SELECT * FROM buses WHERE id = $1', [busId]);
    const result = await pool.query(
      'INSERT INTO trips (bus_id, route_id, departure_time, arrival_time, available_seats, available_standby) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [busId, routeId, departureTime, arrivalTime, bus.rows[0].capacity, bus.rows[0].standby_capacity]
    );
    const trip = result.rows[0];
    await safeRedis(redisClient.set(`trip:${trip.id}:seats:available`, trip.available_seats), null);
    await safeRedis(redisClient.set(`trip:${trip.id}:standby:available`, trip.available_standby), null);
    return trip;
  }

  static isTripActive(trip) {
    const now = new Date();
    const oneHourBeforeDeparture = new Date(new Date(trip.departure_time).getTime() - 60 * 60 * 1000);
    return now < oneHourBeforeDeparture;
  }

  static async findAll(filters = {}) {
    let query = 'SELECT t.*, r.name as route_name, r.direction, r.single_trip_fare, r.classification, b.bus_number FROM trips t JOIN routes r ON t.route_id = r.id JOIN buses b ON t.bus_id = b.id';
    const params = [];
    let paramIndex = 1;
    const conditions = [];

    if (filters.routeId) {
      conditions.push(`t.route_id = $${paramIndex++}`);
      params.push(filters.routeId);
    }
    if (filters.direction) {
      conditions.push(`r.direction = $${paramIndex++}`);
      params.push(filters.direction);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.departure_time';
    const result = await pool.query(query, params);
    return result.rows.map(trip => ({ ...trip, is_active: this.isTripActive(trip) }));
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT t.*, r.name as route_name, r.direction, b.bus_number FROM trips t JOIN routes r ON t.route_id = r.id JOIN buses b ON t.bus_id = b.id WHERE t.id = $1',
      [id]
    );
    if (!result.rows.length) return null;
    const trip = result.rows[0];
    return { ...trip, is_active: this.isTripActive(trip) };
  }

  static async getAvailableSeats(tripId) {
    const result = await pool.query('SELECT available_seats FROM trips WHERE id = $1', [tripId]);
    if (result.rows.length > 0) {
      await safeRedis(redisClient.set(`trip:${tripId}:seats:available`, result.rows[0].available_seats), null);
      return result.rows[0].available_seats;
    }
    return 0;
  }

  // The database is the source of truth. Call this after a transaction changes
  // availability to update both seat and standby cache entries together.
  static async refreshAvailableSeats(tripId) {
    const result = await pool.query(
      'SELECT available_seats, available_standby FROM trips WHERE id = $1',
      [tripId]
    );
    if (!result.rows.length) return null;

    const trip = result.rows[0];
    await safeRedis(redisClient.set(`trip:${tripId}:seats:available`, trip.available_seats), null);
    await safeRedis(redisClient.set(`trip:${tripId}:standby:available`, trip.available_standby), null);
    return trip.available_seats;
  }

  static async decrementAvailableSeats(tripId, amount = 1) {
    const result = await pool.query(
      'UPDATE trips SET available_seats = available_seats - $1 WHERE id = $2 RETURNING available_seats',
      [amount, tripId]
    );
    const newVal = result.rows[0].available_seats;
    await safeRedis(redisClient.set(`trip:${tripId}:seats:available`, newVal), null);
    return newVal;
  }

  static async incrementAvailableSeats(tripId, amount = 1) {
    const result = await pool.query(
      'UPDATE trips SET available_seats = available_seats + $1 WHERE id = $2 RETURNING available_seats',
      [amount, tripId]
    );
    const newVal = result.rows[0].available_seats;
    await safeRedis(redisClient.set(`trip:${tripId}:seats:available`, newVal), null);
    return newVal;
  }

  static async updateStatus(tripId, status, delayTime = null) {
    const query = 'UPDATE trips SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
    const params = [status, tripId];
    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = Trip;
