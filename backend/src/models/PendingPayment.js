
const pool = require('../config/db');

class PendingPayment {
  static async create(userId, transactionId, amount) {
    const result = await pool.query(
      'INSERT INTO pending_payments (user_id, transaction_id, amount) VALUES ($1, $2, $3) RETURNING *',
      [userId, transactionId, amount]
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
}

module.exports = PendingPayment;
