const pool = require('../config/db');

class Bus {
  static async create({ busNumber, capacity = 40, standbyCapacity = 10 }) {
    const result = await pool.query(
      'INSERT INTO buses (bus_number, capacity, standby_capacity) VALUES ($1, $2, $3) RETURNING *',
      [busNumber, capacity, standbyCapacity]
    );
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT * FROM buses WHERE is_active = TRUE ORDER BY bus_number');
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM buses WHERE id = $1', [id]);
    return result.rows[0];
  }
}

module.exports = Bus;
