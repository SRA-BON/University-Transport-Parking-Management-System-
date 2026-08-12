const pool = require('../config/db');

class Route {
  static async create({ name, direction, classification, singleTripFare, roundTripFare }) {
    const result = await pool.query(
      'INSERT INTO routes (name, direction, classification, single_trip_fare, round_trip_fare) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, direction, classification, singleTripFare, roundTripFare]
    );
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT * FROM routes ORDER BY name');
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM routes WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async addStoppage(routeId, stoppageName, orderIndex) {
    const result = await pool.query(
      'INSERT INTO route_stoppages (route_id, name, order_index) VALUES ($1, $2, $3) RETURNING *',
      [routeId, stoppageName, orderIndex]
    );
    return result.rows[0];
  }

  static async getStoppages(routeId) {
    const result = await pool.query(
      'SELECT * FROM route_stoppages WHERE route_id = $1 ORDER BY order_index',
      [routeId]
    );
    return result.rows;
  }
}

module.exports = Route;
