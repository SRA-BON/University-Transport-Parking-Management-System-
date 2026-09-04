
const pool = require('../config/db');

class PendingPayment {
  static async create(userId, transactionId, amount, method = 'sslcommerz', status = 'pending') {
    const result = await pool.query(
      'INSERT INTO pending_payments (user_id, transaction_id, amount, method, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, transactionId, amount, method, status]
    );
    return result.rows[0];
  }

  static async findByTransactionId(transactionId) {
    const result = await pool.query(
      'SELECT * FROM pending_payments WHERE transaction_id = $1',
      [transactionId]
    );
    return result.rows[0];
  }

  static async updateStatus(id, status, gatewayResponse = null) {
    const result = await pool.query(
      'UPDATE pending_payments SET status = $1, gateway_response = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, gatewayResponse, id]
    );
    return result.rows[0];
  }

  static async listPendingBkash() {
    const result = await pool.query(
      `SELECT pp.*, u.name AS user_name, u.email,
         COALESCE(s.student_id, m.manager_id, b.bus_attendant_id, p.parking_attendant_id) AS student_id
         FROM pending_payments pp
         JOIN users u ON pp.user_id = u.id
         LEFT JOIN students s ON s.user_id = u.id
         LEFT JOIN managers m ON m.user_id = u.id
         LEFT JOIN bus_attendants b ON b.user_id = u.id
         LEFT JOIN parking_attendants p ON p.user_id = u.id
        WHERE pp.method = 'bkash_manual' AND pp.status = 'pending_bkash_verification'
        ORDER BY pp.created_at DESC`
    );
    return result.rows;
  }
}

module.exports = PendingPayment;
