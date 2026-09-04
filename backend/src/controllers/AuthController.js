const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const EmailService = require('../services/EmailService');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const VALID_AUDIENCES = [
  GOOGLE_CLIENT_ID,
];
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

class AuthController {
  static async register(req, res) {
    try {
      console.log('📝 Register request received:', req.body);
      
      const { name, studentId, student_id, email, password, role, rfidId, department } = req.body;
      const studentIdValue = studentId || student_id;

      const finalRole = role || 'student';
      if (finalRole === 'student' && studentIdValue) {
        const clean = String(studentIdValue).trim();
        if (!/^(22|23)\d{6}$/.test(clean)) {
          return res.status(400).json({ error: 'Student ID must be 8 digits starting with 22 or 23 (e.g. 22201297)' });
        }
      }
      if (['admin', 'manager', 'bus_attendant', 'parking_attendant'].includes(finalRole)) {
        const pool = require('../config/db');
        const existingCheck = await pool.query('SELECT COUNT(*)::int as cnt FROM users WHERE role = $1', [finalRole]);
        if (finalRole === 'admin' && existingCheck.rows[0].cnt >= 1) {
          return res.status(400).json({ error: 'System supports only one admin account' });
        }
      }
      
      console.log('🔍 Checking for existing user with email:', email);
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        console.log('⚠️ User already exists');
        return res.status(400).json({ error: 'User already exists with this email' });
      }
      
      console.log('👤 Creating new user...');
      const user = await User.create({ name, studentId: studentIdValue, email, password, role, rfidId, department });
      
      console.log('✅ User created:', user);
      
      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
      
      console.log('🎫 Token generated');
      
      res.status(201).json({ 
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          student_id: user.student_id, 
          role: user.role, 
          no_show_count: user.no_show_count || 0,
          rfid_id: user.rfid_id,
          department: user.department
        }, 
        token 
      });
    } catch (err) {
      console.error('❌ Register Error:', err);
      res.status(500).json({ error: 'Failed to register', details: err.message });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;
      
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      if (user.is_active === false) {
        return res.status(403).json({ 
          error: 'BANNED', 
          message: "Access Denied: You have been temporarily suspended from the system. Please contact administration for further support." 
        });
      }
      
      const isValidPassword = await User.verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
      
      res.json({ 
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          student_id: user.student_id, 
          role: user.role, 
          no_show_count: user.no_show_count || 0,
          rfid_id: user.rfid_id,
          department: user.department
        }, 
        token 
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to login' });
    }
  }
  
  static async googleAuth(req, res) {
    try {
      const { idToken } = req.body;
      
      console.log('🔐 Google Auth request received. idToken length:', idToken ? idToken.length : 'undefined');

      if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
        return res.status(400).json({ error: 'Google ID token is required' });
      }

      const tokenParts = idToken.split('.');
      if (tokenParts.length !== 3) {
        console.error('❌ Invalid ID token format:', tokenParts.length, 'parts');
        return res.status(400).json({ error: 'Invalid Google ID token format' });
      }

      let ticket;
      try {
        ticket = await client.verifyIdToken({
          idToken: idToken.trim(),
          audience: VALID_AUDIENCES,
          maxExpiry: Math.floor(Date.now() / 1000) + 60 * 60,
        });
      } catch (verifyErr) {
        console.error('❌ Google ID Token Verification Failed:', verifyErr.message);
        console.error('❌ Stack:', verifyErr.stack);
        console.error('❌ Token (first 100 chars):', idToken.substring(0, 100));
        
        if (verifyErr.message && (verifyErr.message.includes('Token used too late') || verifyErr.message.includes('expired'))) {
          return res.status(400).json({ 
            error: 'Google session expired. Please sign in again.',
            debug: verifyErr.message
          });
        }
        if (verifyErr.message && (verifyErr.message.includes('Invalid token') || verifyErr.message.includes('invalid_token'))) {
          return res.status(400).json({ 
            error: 'Invalid Google token. Please clear browser cache and try again.',
            debug: verifyErr.message
          });
        }
        if (verifyErr.message && verifyErr.message.includes('Wrong number of segments')) {
          return res.status(400).json({ 
            error: 'Malformed Google token.',
            debug: verifyErr.message
          });
        }
        if (verifyErr.message && (verifyErr.message.includes('audience') || verifyErr.message.includes('client_id'))) {
          return res.status(400).json({ 
            error: 'Google token audience mismatch. Please check Google Cloud Console configuration.',
            debug: verifyErr.message
          });
        }
        return res.status(400).json({ 
          error: 'Google token verification failed.',
          debug: verifyErr.message
        });
      }

      const payload = ticket.getPayload();
      console.log('✅ Google token payload:', {
        sub: payload?.sub,
        email: payload?.email,
        email_verified: payload?.email_verified,
        name: payload?.name,
        iss: payload?.iss,
        aud: payload?.aud,
        iat: payload?.iat,
        exp: payload?.exp,
        now: Math.floor(Date.now() / 1000),
      });

      if (!VALID_ISSUERS.includes(payload?.iss)) {
        console.error('❌ Invalid token issuer:', payload?.iss);
        return res.status(400).json({ error: 'Invalid Google token issuer.' });
      }

      if (!payload?.aud || !VALID_AUDIENCES.some(a => payload.aud.includes(a) || a.includes(payload.aud))) {
        console.error('❌ Token audience mismatch. aud:', payload.aud, 'expected:', VALID_AUDIENCES);
        return res.status(400).json({ 
          error: 'Google token does not match this application.',
          debug: `aud=${payload.aud}`
        });
      }

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 60) {
        return res.status(400).json({ error: 'Google token has expired. Please sign in again.' });
      }

      const { email, name, sub: googleId, email_verified } = payload;

      if (!email_verified) {
        return res.status(403).json({ 
          error: 'Google email is not verified. Please verify your email with Google first.' 
        });
      }

      if (!email || !email.endsWith('@g.bracu.ac.bd')) {
        console.warn(`⚠️ Email domain rejected: ${email}`);
        return res.status(403).json({ 
          error: 'Access denied. Only BRAC University emails (@g.bracu.ac.bd) are allowed to sign in with Google. Your email: ' + (email || '(none)')
        });
      }

      console.log(`🔐 Google OAuth: Verified ${email} (${name})`);

      let user = await User.findByEmail(email);

      if (user && user.is_active === false) {
        return res.status(403).json({ 
          error: 'BANNED', 
          message: "Access Denied: You have been temporarily suspended from the system. Please contact administration for further support." 
        });
      }

      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        console.log(`🆕 Creating NEW student account for ${email}...`);
        try {
          user = await User.create({
            name: name || email.split('@')[0],
            studentId: null,
            email,
            password: null,
            googleId: googleId,
            role: 'student',
            rfidId: null,
            department: null
          });
          console.log(`✅ New student created: ${user.student_id} (${user.email})`);
        } catch (createErr) {
          console.error('❌ Failed to create new user during Google auth:', createErr);
          return res.status(500).json({ 
            error: 'Failed to create user account. Please try registering manually.',
            details: createErr.message
          });
        }
      } else {
        console.log(`✅ Existing student signed in: ${user.student_id} (${user.email})`);
        if (!user.google_id && googleId) {
          try {
            const updated = await User.updateGoogleId(user.id, googleId);
            user.google_id = updated?.google_id || googleId;
            console.log(`🔗 Linked google_id to existing user ${user.student_id}`);
          } catch (e) {
            console.warn('⚠️ Failed to link google_id:', e.message);
          }
        }
      }

      try {
        const wCheck = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [user.id]);
        if (wCheck.rows.length === 0) {
          await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [user.id]);
          console.log('💳 Wallet created for existing user without wallet');
        }
      } catch (e) {
        console.warn('Wallet check skipped:', e.message);
      }

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
      console.log(`🎫 Generated JWT for user ${user.id}, token length:`, token.length);
      
      res.json({ 
        message: isNewUser ? 'Account created & signed in successfully' : 'Signed in successfully',
        isNewUser,
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          student_id: user.student_id, 
          role: user.role, 
          no_show_count: user.no_show_count || 0,
          rfid_id: user.rfid_id,
          department: user.department
        }, 
        token 
      });
    } catch (err) {
      console.error('❌ Unhandled Google Auth Error:', err);
      console.error('❌ Stack trace:', err.stack);
      res.status(500).json({ 
        error: 'Failed to authenticate with Google. Please try again or use manual login.',
        details: err.message
      });
    }
  }
  
  /**
   * Get current user profile
   */
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          student_id: user.student_id,
          role: user.role,
          no_show_count: user.no_show_count || 0,
          rfid_id: user.rfid_id,
          department: user.department
        }
      });
    } catch (err) {
      console.error('Get Profile Error:', err);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }
  
  /**
   * Update user profile
   */
  static async updateProfile(req, res) {
    try {
      const updates = req.body;
      
      // Prevent updating role and sensitive fields
      delete updates.role;
      delete updates.password_hash;
      delete updates.id;
      
      const user = await User.update(req.user.id, updates);
      
      res.json({
        message: 'Profile updated successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          student_id: user.student_id,
          role: user.role,
          no_show_count: user.no_show_count || 0,
          rfid_id: user.rfid_id,
          department: user.department
        }
      });
    } catch (err) {
      console.error('Update Profile Error:', err);
      res.status(500).json({ error: 'Failed to update profile', details: err.message });
    }
  }

  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email address is required.' });
      }

      const user = await User.findByEmail(email.trim().toLowerCase());
      if (!user) {
        // Do not reveal whether email exists in system for security, but for dev UX we can return success silently
        console.log('[Auth] Forgot password requested for non-existent email:', email);
        return res.json({ message: 'If your email is registered, you will receive a password reset link shortly.' });
      }

      if (user.is_active === false) {
        return res.status(403).json({ error: 'Account is deactivated. Please contact administration.' });
      }

      // 1. Generate a signed JWT reset token (15 minute expiry)
      const resetToken = jwt.sign(
        { userId: user.id, purpose: 'password_reset', email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      // 2. Persist token in password_resets table so we can invalidate single-use
      try {
        await pool.query('UPDATE password_resets SET is_used = TRUE WHERE user_id = $1 AND is_used = FALSE', [user.id]);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await pool.query(
          `INSERT INTO password_resets (user_id, otp_code, reset_token, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [user.id, 'LINK', resetToken, expiresAt]
        );
      } catch (dbErr) {
        console.warn('[Auth] Could not persist reset token in DB (column may not exist yet). Proceeding with JWT-only validation:', dbErr.message);
      }

      // 3. Build the reset link pointing to the frontend Set New Password page
      //    Prefer the origin reported by the user's browser (when provided) so the link
      //    lands on the exact port they are using (5173 / 5174 / 5177 ...).
      const fallbackFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
      const requestedOrigin = (req.body && typeof req.body.frontendOrigin === 'string' && req.body.frontendOrigin.trim()) ? req.body.frontendOrigin.trim() : null;
      let frontendUrl = fallbackFrontend.replace(/\/+$/, '');
      if (requestedOrigin) {
        try {
          const originUrl = new URL(requestedOrigin.replace(/\/+$/, ''));
          const allowedHostnames = ['localhost', '127.0.0.1'];
          if (allowedHostnames.includes(originUrl.hostname) || originUrl.hostname.endsWith('.local') || originUrl.hostname.endsWith('.bracu.ac.bd')) {
            frontendUrl = originUrl.origin;
          }
        } catch (_) { /* ignore malformed origin and fall back to env */ }
      }
      const resetLink = `${frontendUrl}/reset-password/${resetToken}`;

      // 4. Send email
      const emailSent = await EmailService.sendPasswordResetLink(user.email, resetLink);
      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send password reset email. Please check SMTP configuration or try again later.' });
      }

      console.log(`[Auth] Password reset link sent to ${user.email}. Token length: ${resetToken.length}. Link expires in 15 min.`);
      res.json({ message: 'If your email is registered, you will receive a password reset link shortly.' });
    } catch (err) {
      console.error('[Auth] Forgot Password Error:', err);
      res.status(500).json({ error: 'Failed to process password reset request.' });
    }
  }

  /**
   * Validate the reset token (called when the user opens the reset link in their browser)
   * Returns the user's display name/email so the page can greet them, or an error if invalid.
   */
  static async validateResetToken(req, res) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ error: 'Reset token is missing.' });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtErr) {
        const msg = jwtErr.name === 'TokenExpiredError'
          ? 'This password reset link has expired. Please request a new one.'
          : 'Invalid or corrupted password reset link.';
        return res.status(400).json({ error: msg, code: jwtErr.name });
      }

      if (!decoded || decoded.purpose !== 'password_reset' || !decoded.userId) {
        return res.status(400).json({ error: 'This reset link is not valid for password reset.' });
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: 'User account no longer exists.' });
      }
      if (user.is_active === false) {
        return res.status(403).json({ error: 'Account is deactivated. Please contact administration.' });
      }

      // Optional: check DB if this token was already used
      try {
        const dbCheck = await pool.query(
          'SELECT is_used FROM password_resets WHERE reset_token = $1 ORDER BY created_at DESC LIMIT 1',
          [token]
        );
        if (dbCheck.rows.length > 0 && dbCheck.rows[0].is_used === true) {
          return res.status(400).json({ error: 'This password reset link has already been used.' });
        }
      } catch (_) { /* DB column may not exist yet; JWT expiry is sufficient */ }

      res.json({
        valid: true,
        email: user.email,
        name: user.name,
      });
    } catch (err) {
      console.error('[Auth] Validate Reset Token Error:', err);
      res.status(500).json({ error: 'Failed to validate reset token.' });
    }
  }

  /**
   * Apply a new password using a valid reset token (single-use).
   */
  static async setNewPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'Reset token is required.' });
      }
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtErr) {
        const msg = jwtErr.name === 'TokenExpiredError'
          ? 'This password reset link has expired. Please request a new one.'
          : 'Invalid or corrupted password reset link.';
        return res.status(400).json({ error: msg });
      }

      if (!decoded || decoded.purpose !== 'password_reset' || !decoded.userId) {
        return res.status(400).json({ error: 'Invalid reset token purpose.' });
      }

      const user = await User.findById(decoded.userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (user.is_active === false) return res.status(403).json({ error: 'Account is deactivated.' });

      // Single-use check via DB
      try {
        const dbCheck = await pool.query(
          'SELECT id, is_used FROM password_resets WHERE reset_token = $1 ORDER BY created_at DESC LIMIT 1',
          [token]
        );
        if (dbCheck.rows.length > 0 && dbCheck.rows[0].is_used === true) {
          return res.status(400).json({ error: 'This password reset link has already been used.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

        if (dbCheck.rows.length > 0) {
          await pool.query('UPDATE password_resets SET is_used = TRUE WHERE id = $1', [dbCheck.rows[0].id]);
        } else {
          // Fallback: mark ALL outstanding tokens for this user as used
          await pool.query('UPDATE password_resets SET is_used = TRUE WHERE user_id = $1 AND is_used = FALSE', [user.id]);
        }
      } catch (dbErr) {
        console.warn('[Auth] DB-backed single-use check skipped (column may be missing), applying password update anyway:', dbErr.message);
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);
      }

      console.log(`[Auth] Password successfully reset for user ${user.id} (${user.email})`);
      res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
    } catch (err) {
      console.error('[Auth] Set New Password Error:', err);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  }

  // Legacy OTP endpoints (kept for backward compatibility; new flow uses link tokens above)
  static async verifyOtp(req, res) {
    try {
      const { email, otp } = req.body;
      const user = await User.findByEmail(email);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const result = await pool.query(
        'SELECT * FROM password_resets WHERE user_id = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [user.id, otp]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
      }
      res.json({ message: 'OTP verified successfully.' });
    } catch (err) {
      console.error('[Auth] Verify OTP Error:', err);
      res.status(500).json({ error: 'Failed to verify OTP' });
    }
  }

  static async resetPassword(req, res) {
    try {
      const { email, otp, newPassword } = req.body;
      const user = await User.findByEmail(email);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const result = await pool.query(
        'SELECT * FROM password_resets WHERE user_id = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [user.id, otp]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);
      await pool.query('UPDATE password_resets SET is_used = TRUE WHERE id = $1', [result.rows[0].id]);
      res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      console.error('[Auth] Reset Password (legacy OTP) Error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
}

module.exports = AuthController;
