const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
  static async create({ name, studentId, student_id, email, password, googleId = null, role = 'student', rfidId = null, department = null }) {
    console.log('👤 User.create called with:', { name, studentId, student_id, email, googleId, role, rfidId, department });
    
    let studentIdValue = studentId || student_id;
    let hashedPassword = null;
    
    if (password) {
      console.log('🔑 Hashing password...');
      hashedPassword = await bcrypt.hash(password, 10);
    }

    if (!studentIdValue) {
      console.log('🆔 Generating student ID...');
      const maxIdResult = await pool.query('SELECT MAX(id) as max_id FROM users');
      const maxId = maxIdResult.rows[0].max_id || 0;
      studentIdValue = `STU-${(maxId + 1).toString().padStart(6, '0')}`;
      console.log('🆔 Generated student ID:', studentIdValue);
    }

    console.log('📝 Inserting user into DB...');
    const result = await pool.query(
      'INSERT INTO users (name, student_id, email, password_hash, google_id, role, rfid_id, department) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, studentIdValue, email, hashedPassword, googleId, role, rfidId, department]
    );
    
    console.log('✅ User inserted:', result.rows[0]);
    
    console.log('💳 Creating wallet...');
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [result.rows[0].id]);
    
    console.log('✅ Wallet created');
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }

  static async findByStudentId(studentId) {
    const result = await pool.query('SELECT * FROM users WHERE student_id = $1', [studentId]);
    return result.rows[0];
  }

  static async findByRFID(rfidId) {
    const result = await pool.query('SELECT * FROM users WHERE rfid_id = $1', [rfidId]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async updateGoogleId(userId, googleId) {
    const result = await pool.query('UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *', [googleId, userId]);
    return result.rows[0];
  }

  static async updateRFID(userId, rfidId) {
    const result = await pool.query('UPDATE users SET rfid_id = $1 WHERE id = $2 RETURNING *', [rfidId, userId]);
    return result.rows[0];
  }

  static async updateDepartment(userId, department) {
    const result = await pool.query('UPDATE users SET department = $1 WHERE id = $2 RETURNING *', [department, userId]);
    return result.rows[0];
  }

  static async update(userId, updates) {
    const allowedFields = ['name', 'student_id', 'email', 'rfid_id', 'department', 'role', 'is_active'];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(userId);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getAll() {
    const result = await pool.query(
      'SELECT id, name, student_id, email, role, is_active, rfid_id, department, created_at FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  static async delete(userId) {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    return result.rows[0];
  }
}

module.exports = User;
