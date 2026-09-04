
const pool = require('../config/db');

// Defaults used when a setting row has not yet been persisted to the DB.
// Admin can override all of these via the settings UI (no restart needed).
const DEFAULTS = {
  'bkash.admin_personal_number': '01779033536',
  'bkash.admin_personal_name':  'Transport Admin',
  'bkash.auto_verify':          'true', // instantly credit wallet on submit (trust-based)
  'bkash.auto_verify_note':     'Automatically credited on submission — admin may reverse later if unpaid',
};

class SystemSetting {
  static async get(key, fallback = null) {
    const r = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    if (r.rows.length) return r.rows[0].value;
    return DEFAULTS[key] ?? fallback;
  }

  static async getAll() {
    const r = await pool.query('SELECT key, value FROM system_settings');
    const rows = Object.fromEntries(r.rows.map(s => [s.key, s.value]));
    // merge defaults
    return { ...DEFAULTS, ...rows };
  }

  static async set(key, value, byUserId = null) {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = NOW()`,
      [key, String(value), byUserId]
    );
    return this.get(key);
  }
}

module.exports = SystemSetting;
