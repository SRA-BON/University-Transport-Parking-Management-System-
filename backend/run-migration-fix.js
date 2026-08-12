require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected');

    const sqlPath = path.join(__dirname, 'database', 'migration_fix_missing_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('📝 Running migration SQL...');
    await client.query(sql);
    console.log('✅ Migration SQL executed successfully');

    console.log('\n🔍 Verifying columns on users table...');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    console.log('Columns on users:');
    cols.rows.forEach(c => console.log(`  - ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`));

    console.log('\n🔍 Listing all public tables...');
    const tbls = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log('Tables:');
    tbls.rows.forEach(r => console.log(`  - ${r.table_name}`));

    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.error('❌ Detail:', err.detail || err.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
