const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
  /**
   * Get the next sequential ID for a given role prefix.
   * Queries the appropriate subtype table to find the max current ID.
   */
  static async _nextId(role) {
    if (role === 'student') {
      // Students: 22xxxxxx or 23xxxxxx — use year prefix + 6 digit sequence
      const year = new Date().getFullYear().toString().slice(-2);
      const res = await pool.query(
        "SELECT student_id FROM students ORDER BY student_id DESC LIMIT 1"
      );
      let seq = 1;
      if (res.rows.length > 0) {
        const last = parseInt(res.rows[0].student_id.slice(-6), 10);
        seq = last + 1;
      }
      let id = `${year}${seq.toString().padStart(6, '0')}`;
      if (!/^(22|23)\d{6}$/.test(id)) {
        id = `22${seq.toString().padStart(6, '0')}`;
      }
      return id;
    } else if (role === 'manager') {
      // Managers: 10xxx
      const res = await pool.query("SELECT manager_id FROM managers ORDER BY manager_id DESC LIMIT 1");
      let seq = 1;
      if (res.rows.length > 0) {
        seq = parseInt(res.rows[0].manager_id.slice(2), 10) + 1;
      }
      return `10${seq.toString().padStart(3, '0')}`;
    } else if (role === 'bus_attendant') {
      // Bus attendants: 20xxx
      const res = await pool.query("SELECT bus_attendant_id FROM bus_attendants ORDER BY bus_attendant_id DESC LIMIT 1");
      let seq = 1;
      if (res.rows.length > 0) {
        seq = parseInt(res.rows[0].bus_attendant_id.slice(2), 10) + 1;
      }
      return `20${seq.toString().padStart(3, '0')}`;
    } else if (role === 'parking_attendant') {
      // Parking attendants: 30xxx
      const res = await pool.query("SELECT parking_attendant_id FROM parking_attendants ORDER BY parking_attendant_id DESC LIMIT 1");
      let seq = 1;
      if (res.rows.length > 0) {
        seq = parseInt(res.rows[0].parking_attendant_id.slice(2), 10) + 1;
      }
      return `30${seq.toString().padStart(3, '0')}`;
    }
    return null; // admin has no ID
  }

  /**
   * Insert the subtype row after a user has been created.
   * Returns the generated/provided ID string (or null for admin).
   */
  static async _insertSubtype(client, userId, role, providedId) {
    if (role === 'admin') {
      await client.query(
        'INSERT INTO admins (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );
      return null;
    }

    let finalId = providedId || null;

    if (role === 'student') {
      if (!finalId) {
        finalId = await User._nextId('student');
      } else {
        finalId = String(finalId).trim();
        if (!/^(22|23)\d{6}$/.test(finalId)) {
          throw new Error('Student ID must be 8 digits starting with 22 or 23 (e.g. 22201297)');
        }
        const dup = await client.query('SELECT 1 FROM students WHERE student_id = $1', [finalId]);
        if (dup.rows.length > 0) throw new Error('Student ID already exists');
      }
      await client.query(
        'INSERT INTO students (student_id, user_id) VALUES ($1, $2)',
        [finalId, userId]
      );
    } else if (role === 'manager') {
      if (!finalId) finalId = await User._nextId('manager');
      else {
        finalId = String(finalId).trim();
        if (!/^10\d{3}$/.test(finalId)) finalId = await User._nextId('manager');
      }
      await client.query(
        'INSERT INTO managers (manager_id, user_id) VALUES ($1, $2)',
        [finalId, userId]
      );
    } else if (role === 'bus_attendant') {
      if (!finalId) finalId = await User._nextId('bus_attendant');
      else {
        finalId = String(finalId).trim();
        if (!/^20\d{3}$/.test(finalId)) finalId = await User._nextId('bus_attendant');
      }
      await client.query(
        'INSERT INTO bus_attendants (bus_attendant_id, user_id) VALUES ($1, $2)',
        [finalId, userId]
      );
    } else if (role === 'parking_attendant') {
      if (!finalId) finalId = await User._nextId('parking_attendant');
      else {
        finalId = String(finalId).trim();
        if (!/^30\d{3}$/.test(finalId)) finalId = await User._nextId('parking_attendant');
      }
      await client.query(
        'INSERT INTO parking_attendants (parking_attendant_id, user_id) VALUES ($1, $2)',
        [finalId, userId]
      );
    }

    return finalId;
  }

  /**
   * Helper: given a raw users row, attach its role-specific ID as `display_id`
   * and also as `student_id` (for backward compat with controllers that reference user.student_id).
   */
  static async _attachId(userRow) {
    if (!userRow) return null;
    const u = { ...userRow };
    let displayId = null;

    if (u.role === 'student') {
      const r = await pool.query('SELECT student_id, no_show_count FROM students WHERE user_id = $1', [u.id]);
      displayId = r.rows[0]?.student_id || null;
      u.no_show_count = r.rows[0]?.no_show_count || 0;
    } else if (u.role === 'manager') {
      const r = await pool.query('SELECT manager_id FROM managers WHERE user_id = $1', [u.id]);
      displayId = r.rows[0]?.manager_id || null;
      u.no_show_count = 0;
    } else if (u.role === 'bus_attendant') {
      const r = await pool.query('SELECT bus_attendant_id FROM bus_attendants WHERE user_id = $1', [u.id]);
      displayId = r.rows[0]?.bus_attendant_id || null;
      u.no_show_count = 0;
    } else if (u.role === 'parking_attendant') {
      const r = await pool.query('SELECT parking_attendant_id FROM parking_attendants WHERE user_id = $1', [u.id]);
      displayId = r.rows[0]?.parking_attendant_id || null;
      u.no_show_count = 0;
    }
    // admin has no display_id
    if (u.role === 'admin') u.no_show_count = 0;

    u.display_id = displayId;
    u.student_id = displayId; // backward compat alias
    return u;
  }

  static async create({ name, studentId, student_id, email, password, googleId = null, role = 'student', rfidId = null, department = null }) {
    console.log('[User] create called with:', { name, studentId, student_id, email, googleId, role, rfidId, department });

    const providedId = studentId || student_id || null;
    let hashedPassword = null;

    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO users (name, email, password_hash, google_id, role, rfid_id, department) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [name, email, hashedPassword, googleId, role, rfidId, department]
      );
      const user = result.rows[0];

      const finalId = await User._insertSubtype(client, user.id, role, providedId);

      await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [user.id]);

      await client.query('COMMIT');

      user.display_id = finalId;
      user.student_id = finalId; // backward compat
      console.log(`[User] Created ${role}: id=${user.id}, display_id=${finalId}`);
      return user;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return User._attachId(result.rows[0]);
  }

  static async findByStudentId(studentId) {
    // Check all subtype tables based on format
    let result;
    if (/^(22|23)\d{6}$/.test(studentId)) {
      result = await pool.query(
        'SELECT u.* FROM users u JOIN students s ON s.user_id = u.id WHERE s.student_id = $1',
        [studentId]
      );
    } else if (/^10\d{3}$/.test(studentId)) {
      result = await pool.query(
        'SELECT u.* FROM users u JOIN managers m ON m.user_id = u.id WHERE m.manager_id = $1',
        [studentId]
      );
    } else if (/^20\d{3}$/.test(studentId)) {
      result = await pool.query(
        'SELECT u.* FROM users u JOIN bus_attendants b ON b.user_id = u.id WHERE b.bus_attendant_id = $1',
        [studentId]
      );
    } else if (/^30\d{3}$/.test(studentId)) {
      result = await pool.query(
        'SELECT u.* FROM users u JOIN parking_attendants p ON p.user_id = u.id WHERE p.parking_attendant_id = $1',
        [studentId]
      );
    } else {
      return null;
    }
    return User._attachId(result.rows[0]);
  }

  static async findByRFID(rfidId) {
    const result = await pool.query('SELECT * FROM users WHERE rfid_id = $1', [rfidId]);
    return User._attachId(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return User._attachId(result.rows[0]);
  }

  static async updateGoogleId(userId, googleId) {
    const result = await pool.query('UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *', [googleId, userId]);
    return User._attachId(result.rows[0]);
  }

  static async updateRFID(userId, rfidId) {
    const result = await pool.query('UPDATE users SET rfid_id = $1 WHERE id = $2 RETURNING *', [rfidId, userId]);
    return User._attachId(result.rows[0]);
  }

  static async updateDepartment(userId, department) {
    const result = await pool.query('UPDATE users SET department = $1 WHERE id = $2 RETURNING *', [department, userId]);
    return User._attachId(result.rows[0]);
  }

  static async update(userId, updates) {
    const allowedBaseFields = ['name', 'email', 'rfid_id', 'department', 'role', 'is_active'];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedBaseFields.includes(key)) {
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
    return User._attachId(result.rows[0]);
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getAll() {
    // Join all subtype tables via LEFT JOINs to get each user's specific ID and no_show_count for students
    const result = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.is_active, u.rfid_id, u.department, u.created_at,
        COALESCE(s.student_id, m.manager_id, b.bus_attendant_id, p.parking_attendant_id) AS display_id,
        COALESCE(s.student_id, m.manager_id, b.bus_attendant_id, p.parking_attendant_id) AS student_id,
        COALESCE(s.no_show_count, 0) AS no_show_count
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN managers m ON m.user_id = u.id
      LEFT JOIN bus_attendants b ON b.user_id = u.id
      LEFT JOIN parking_attendants p ON p.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  }

  static async delete(userId) {
    // Subtype rows cascade delete via FK
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    return result.rows[0];
  }
}

module.exports = User;
