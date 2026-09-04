const pool = require('./src/config/db');

async function run() {
  // Fix roles that don't match schema (super_admin -> admin)
  const fix = await pool.query("UPDATE users SET role='admin' WHERE role='super_admin' RETURNING id, name, role");
  console.log('Fixed roles:', fix.rows);

  // Seed admins table
  const admins = await pool.query("SELECT id FROM users WHERE role='admin'");
  for (const a of admins.rows) {
    await pool.query('INSERT INTO admins (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [a.id]);
  }
  console.log('Admins seeded:', admins.rows.length);

  // Show current state
  const users = await pool.query('SELECT id, name, role FROM users');
  console.log('Users:', users.rows);
  const students = await pool.query('SELECT * FROM students');
  console.log('Students:', students.rows);
  const managers = await pool.query('SELECT * FROM managers');
  console.log('Managers:', managers.rows);

  await pool.end();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
