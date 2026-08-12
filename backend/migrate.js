require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function migrate() {
  console.log('🛠️  Starting Supabase DB migration...');
  
  try {
    // Step 1: Fix users.role constraint and student_id nullable
    console.log('🔧 Fixing users table role constraint...');
    try {
      await pool.query(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      `);
      await pool.query(`
        ALTER TABLE users ALTER COLUMN student_id DROP NOT NULL;
      `);
      await pool.query(`
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'manager', 'developer'));
      `);
      console.log('✅ Users role constraint updated to: student, manager, developer');
    } catch (e) {
      console.log('ℹ️  Users table may not exist yet, continuing...');
    }

    // Step 2: Run full schema.sql (CREATE IF NOT EXISTS for all tables, indexes, triggers)
    console.log('📋 Running full schema.sql...');
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    let schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
    // Remove comments and split by ;
    const statements = schemaSQL
      .replace(/--.*$/gm, '')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    let count = 0;
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
        count++;
      } catch (e) {
        // Ignore errors (likely relation already exists)
      }
    }
    console.log(`✅ Schema applied: ${count} statements executed`);

    // Step 3: Migrate any existing users with wrong role values
    console.log('🔄 Migrating existing user roles...');
    try {
      const updateResult = await pool.query(`
        UPDATE users SET role = CASE
          WHEN role = 'admin' THEN 'developer'
          WHEN role = 'management' THEN 'manager'
          ELSE role
        END
        WHERE role IN ('admin', 'management')
        RETURNING id, role;
      `);
      if (updateResult.rows.length > 0) {
        console.log(`✅ Migrated ${updateResult.rows.length} user roles: admin→developer, management→manager`);
      } else {
        console.log('✅ No role migrations needed');
      }
    } catch (e) {
      console.log('ℹ️  Role migration step skipped:', e.message);
    }

    // Step 4: Verify connection by listing tables
    console.log('🔍 Verifying tables exist...');
    const tblResult = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    console.log('✅ Tables in Supabase DB:');
    tblResult.rows.forEach(r => console.log('   -', r.table_name));

    console.log('\n🎉 Migration complete! Supabase DB is configured.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
