const pool = require('./src/config/db');

async function run() {
  // Migrate existing admin users into admins table
  const adminRes = await pool.query("SELECT id FROM users WHERE role='admin'");
  for (const a of adminRes.rows) {
    await pool.query('INSERT INTO admins (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [a.id]);
  }
  console.log('Admins seeded:', adminRes.rows.length);

  // Migrate existing students: move student_id from users table to students table (if column still exists)
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='student_id'");
    if (colCheck.rows.length > 0) {
      // Migrate students
      const studRes = await pool.query("SELECT id, student_id FROM users WHERE role='student' AND student_id IS NOT NULL");
      for (const s of studRes.rows) {
        await pool.query('INSERT INTO students (student_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.student_id, s.id]);
      }
      console.log('Students migrated:', studRes.rows.length);

      // Migrate managers
      const mgrRes = await pool.query("SELECT id, student_id FROM users WHERE role='manager' AND student_id IS NOT NULL");
      for (const m of mgrRes.rows) {
        await pool.query('INSERT INTO managers (manager_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.student_id, m.id]);
      }
      console.log('Managers migrated:', mgrRes.rows.length);

      // Migrate bus attendants
      const busRes = await pool.query("SELECT id, student_id FROM users WHERE role='bus_attendant' AND student_id IS NOT NULL");
      for (const b of busRes.rows) {
        await pool.query('INSERT INTO bus_attendants (bus_attendant_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [b.student_id, b.id]);
      }
      console.log('Bus attendants migrated:', busRes.rows.length);

      // Migrate parking attendants
      const prkRes = await pool.query("SELECT id, student_id FROM users WHERE role='parking_attendant' AND student_id IS NOT NULL");
      for (const p of prkRes.rows) {
        await pool.query('INSERT INTO parking_attendants (parking_attendant_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [p.student_id, p.id]);
      }
      console.log('Parking attendants migrated:', prkRes.rows.length);

      // Now drop old ID columns from users
      await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS student_id, DROP COLUMN IF EXISTS manager_id, DROP COLUMN IF EXISTS bus_attendant_id, DROP COLUMN IF EXISTS parking_attendant_id');
      console.log('Old ID columns dropped from users table');
    } else {
      console.log('No student_id column on users – already migrated or clean DB');
    }
  } catch (e) {
    console.error('Migration error:', e.message);
  }

  await pool.end();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
