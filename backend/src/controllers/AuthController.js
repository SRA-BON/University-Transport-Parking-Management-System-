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
        const pool = require('../config/db');
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
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found with this email' });
      }

      if (user.is_active === false) {
        return res.status(403).json({ error: 'Account is deactivated.' });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes from now

      // Invalidate existing unused OTPs
      await pool.query('UPDATE password_resets SET is_used = TRUE WHERE user_id = $1 AND is_used = FALSE', [user.id]);

      await pool.query(
        'INSERT INTO password_resets (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
        [user.id, otp, expiresAt]
      );

      const emailSent = await EmailService.sendOTP(email, otp);
      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send OTP email. Please try again later.' });
      }

      res.json({ message: 'OTP sent to your email successfully.' });
    } catch (err) {
      console.error('Forgot Password Error:', err);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }

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
      console.error('Verify OTP Error:', err);
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
      console.error('Reset Password Error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
}

module.exports = AuthController;
