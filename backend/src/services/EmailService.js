const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.senderName = process.env.EMAIL_FROM_NAME || 'BRACU Transport System';
    this.senderEmail = process.env.EMAIL_FROM_ADDRESS || 'noreply@transport.bracu.ac.bd';
    this._initialized = false;
    this._initPromise = null;
  }

  async _init() {
    if (this._initialized && this.transporter) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        if (
          process.env.SMTP_HOST &&
          process.env.SMTP_PORT &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASS
        ) {
          console.log('📧 EmailService: Using configured SMTP credentials from .env');
          this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: String(process.env.SMTP_SECURE) === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });
        } else {
          console.log('📧 EmailService: No SMTP creds in .env, creating Ethereal test account...');
          const account = await new Promise((resolve, reject) => {
            nodemailer.createTestAccount((err, acc) => {
              if (err) reject(err);
              else resolve(acc);
            });
          });

          console.log(`📧 Ethereal account created: ${account.user} / ${account.pass}`);
          console.log(`📧 Ethereal Web: https://ethereal.email/login (use above credentials)`);

          this.transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
              user: account.user,
              pass: account.pass,
            },
          });
          this._isEthereal = true;
          this._etherealUser = account.user;
          this._etherealPass = account.pass;
        }

        try {
          await this.transporter.verify();
          console.log('✅ EmailService: SMTP connection verified and ready');
        } catch (verifyErr) {
          console.warn('⚠️ EmailService: SMTP verify failed, will still try to send:', verifyErr.message);
        }

        this._initialized = true;
      } catch (err) {
        console.error('❌ EmailService init failed:', err.message);
        this.transporter = null;
        throw err;
      }
    })();

    return this._initPromise;
  }

  async sendOTP(to, otp) {
    try {
      await this._init();
      if (!this.transporter) {
        console.error('[Email] Transporter not available, cannot send OTP');
        console.log(`[Email] Fallback OTP for ${to}: ${otp} (expires in 10 minutes)`);
        return false;
      }

      const info = await this.transporter.sendMail({
        from: `"${this.senderName}" <${this.senderEmail}>`,
        to: to,
        subject: 'Password Reset OTP — BRACU Transport System',
        text: `Your OTP for password reset is: ${otp}. It will expire in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— BRACU Transport System`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #eaeaea;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0; color: #6C63FF;">BRACU Transport System</h2>
              <p style="color: #666; margin-top: 8px; font-size: 14px;">Password Reset Request</p>
            </div>
            <p style="font-size: 15px; color: #333; line-height: 1.6;">Hi there,</p>
            <p style="font-size: 15px; color: #333; line-height: 1.6;">You have requested to reset your password. Use the OTP below to continue:</p>
            <div style="text-align: center; margin: 28px 0;">
              <span style="display: inline-block; font-size: 30px; font-weight: 800; letter-spacing: 8px; padding: 14px 32px; background: #F3F1FF; color: #6C63FF; border-radius: 10px; border: 2px dashed #6C63FF;">${otp}</span>
            </div>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">⏱️ This code will expire in <strong>10 minutes</strong>.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999; line-height: 1.5;">If you didn't request this password reset, you can safely ignore this email. Your account remains secure.</p>
          </div>
        `,
      });

      console.log('[Email] OTP email sent:', info.messageId, 'to', to);
      if (this._isEthereal) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('[Email] Ethereal preview:', previewUrl);
      }
      return true;
    } catch (error) {
      console.error('[Email] Error sending OTP email:', error.message);
      console.log(`[Email] Fallback OTP for ${to}: ${otp} (expires in 10 minutes)`);
      return false;
    }
  }

  async sendPasswordResetLink(to, resetLink) {
    try {
      await this._init();
      if (!this.transporter) {
        console.error('[Email] Transporter not available, cannot send reset link');
        console.log(`[Email] Fallback reset link for ${to}: ${resetLink}`);
        return false;
      }

      const info = await this.transporter.sendMail({
        from: `"${this.senderName}" <${this.senderEmail}>`,
        to: to,
        subject: 'Password Reset Link — BRACU Transport System',
        text: `You have requested to reset your password.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— BRACU Transport System`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; background: #ffffff; border-radius: 12px; border: 1px solid #eaeaea;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="margin: 0; color: #6C63FF; font-size: 22px;">BRACU Transport System</h2>
              <p style="color: #666; margin-top: 8px; font-size: 14px;">Reset Your Password</p>
            </div>

            <p style="font-size: 15px; color: #333; line-height: 1.6;">Hi there,</p>
            <p style="font-size: 15px; color: #333; line-height: 1.6;">
              We received a request to reset the password for your account. Click the button below to set a new password:
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #6C63FF 0%, #4A3FFF 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 15px; box-shadow: 0 6px 18px rgba(108, 99, 255, 0.35);">
                Set New Password
              </a>
            </div>

            <p style="font-size: 13px; color: #666; line-height: 1.6; word-break: break-all;">
              If the button above doesn't work, copy and paste this URL into your browser:<br />
              <a href="${resetLink}" style="color: #6C63FF;">${resetLink}</a>
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

            <p style="font-size: 13px; color: #555; line-height: 1.5;">
              ⏱️ This link will expire in <strong>15 minutes</strong>.
            </p>

            <p style="font-size: 12px; color: #999; line-height: 1.5; margin-top: 12px;">
              If you didn't request this password reset, you can safely ignore this email. Your account remains secure and no changes have been made.
            </p>
          </div>
        `,
      });

      console.log('[Email] Password reset link sent:', info.messageId, 'to', to);
      if (this._isEthereal) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('[Email] Ethereal preview:', previewUrl);
      }
      return true;
    } catch (error) {
      console.error('[Email] Error sending reset link email:', error.message);
      if (error.stack) console.error('[Email] Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
      console.log(`[Email] Fallback reset link for ${to}: ${resetLink}`);
      return false;
    }
  }
}

module.exports = new EmailService();
