const pool = require('../config/db');

class Wallet {
  static async findByUserId(userId, client = null) {
    const q = 'SELECT * FROM wallets WHERE user_id = $1';
    const params = [userId];
    if (client) {
      const res = await client.query(q, params);
      return res.rows[0];
    }
    const result = await pool.query(q, params);
    return result.rows[0];
  }

  /**
   * Update a wallet's balance and record a transaction.
   * If `client` is provided, we reuse the existing connection and do NOT
   * BEGIN/COMMIT/ROLLBACK here — the caller owns the transaction lifecycle.
   */
  static async updateBalance(userId, amount, description, bookingId = null, client = null) {
    const ownClient = client ? null : await pool.connect();
    try {
      const c = client || ownClient;
      if (!client) await c.query('BEGIN');

      const walletResult = await c.query(
        'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      const newBalance = Number(wallet.balance) + Number(amount);
      if (newBalance < 0) {
        throw new Error('Insufficient balance');
      }

      await c.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE user_id = $2',
        [newBalance, userId]
      );

      const txType = amount > 0 ? 'recharge' : amount < 0 ? 'payment' : 'refund';
      await c.query(
        'INSERT INTO transactions (wallet_id, amount, type, description, booking_id) VALUES ($1, $2, $3, $4, $5)',
        [wallet.id, amount, txType, description, bookingId]
      );

      if (!client) await c.query('COMMIT');
      return { ...wallet, balance: newBalance };
    } catch (err) {
      if (!client && ownClient) await ownClient.query('ROLLBACK');
      throw err;
    } finally {
      if (ownClient) ownClient.release();
    }
  }
}

module.exports = Wallet;
