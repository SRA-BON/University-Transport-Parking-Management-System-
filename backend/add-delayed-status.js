
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

(async () => {
  try {
    await pool.query('ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check');
    await pool.query("ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'delayed'))");
    console.log('✅ Added "delayed" status to trips table');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
})();
