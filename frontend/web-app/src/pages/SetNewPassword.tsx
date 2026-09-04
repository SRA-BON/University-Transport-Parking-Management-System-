import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function SetNewPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    return () => { document.documentElement.removeAttribute('data-theme'); };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 520);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const validateToken = async () => {
      if (!token) {
        setValidating(false);
        setTokenError('Invalid reset link: no token provided.');
        return;
      }
      try {
        const res = await api.get(`/auth/reset/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.data?.valid) {
          setTokenValid(true);
          setEmail(res.data.email || null);
        } else {
          setTokenError(res.data?.error || 'Invalid or expired reset link.');
        }
      } catch (err: any) {
        if (cancelled) return;
        setTokenError(err.response?.data?.error || err.message || 'Invalid or expired reset link.');
      } finally {
        if (!cancelled) setValidating(false);
      }
    };
    validateToken();
    return () => { cancelled = true; };
  }, [token]);

  const getPasswordStrength = (pw: string): { label: string; color: string; level: number } => {
    if (!pw) return { label: '', color: '#e0e0e0', level: 0 };
    if (pw.length < 6) return { label: 'Too short', color: '#ef4444', level: 1 };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: 'Weak', color: '#f59e0b', level: 2 };
    if (score <= 2) return { label: 'Fair', color: '#fbbf24', level: 3 };
    if (score <= 3) return { label: 'Good', color: '#10b981', level: 4 };
    return { label: 'Strong', color: '#059669', level: 5 };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Reset token is missing. Please request a new password reset link.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-type both fields.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/set-new-password', { token, newPassword });
      setSuccessMsg(res.data?.message || 'Password updated successfully! Redirecting to login...');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div style={getRootStyles(isMobile)}>
        <div style={getCardStyles(isMobile)}>
          <div style={styles.header}>
            <img
              src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png"
              alt="BRACU Logo"
              style={{
                width: isMobile ? '140px' : '160px',
                maxWidth: '100%',
                height: 'auto',
                marginBottom: isMobile ? '12px' : '20px',
              }}
            />
            <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '22px' } : {}) }}>Validating Link</h1>
            <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>Please wait while we verify your reset link...</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <div className="loading-spinner dark" />
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid || tokenError) {
    return (
      <div style={getRootStyles(isMobile)}>
        <div style={getCardStyles(isMobile)}>
          <div style={styles.header}>
            <img
              src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png"
              alt="BRACU Logo"
              style={{
                width: isMobile ? '140px' : '160px',
                maxWidth: '100%',
                height: 'auto',
                marginBottom: isMobile ? '12px' : '20px',
              }}
            />
            <h1 style={{ ...styles.title, color: '#c62828', ...(isMobile ? { fontSize: '22px' } : {}) }}>Invalid or Expired Link</h1>
            <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>
              {tokenError || 'This password reset link is no longer valid. It may have already been used or has expired after 15 minutes.'}
            </p>
          </div>
          <div style={styles.errorBox}>
            {tokenError || 'Reset link is invalid. Please request a new one.'}
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/forgot-password" style={{ ...styles.primaryButton, textDecoration: 'none', textAlign: 'center' }}>
              Request New Reset Link
            </Link>
            <Link to="/login" style={styles.link}>
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={getRootStyles(isMobile)}>
      <div style={getCardStyles(isMobile)}>
        <div style={styles.header}>
          <img
            src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png"
            alt="BRACU Logo"
            style={{
              width: isMobile ? '140px' : '160px',
              maxWidth: '100%',
              height: 'auto',
              marginBottom: isMobile ? '12px' : '20px',
            }}
          />
          <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '22px' } : {}) }}>Set New Password</h1>
          <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>
            {email ? (
              <>Hi <strong style={{ color: '#1a1a1a' }}>{email}</strong>, enter your new password below.</>
            ) : (
              <>Enter your new password below to regain access to your account.</>
            )}
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {successMsg && <div style={styles.successBox}>{successMsg}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              style={styles.input}
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading || !!successMsg}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
              tabIndex={-1}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>

          {newPassword && (
            <div style={{ marginTop: -4 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: i <= strength.level ? strength.color : '#e0e0e0',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, color: strength.color, fontWeight: 600 }}>
                {strength.label}
              </div>
            </div>
          )}

          <label style={{ ...styles.label, marginTop: 12 }}>Confirm New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              style={styles.input}
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-type your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading || !!successMsg}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={styles.eyeBtn}
              tabIndex={-1}
            >
              {showConfirm ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>

          {confirmPassword && newPassword !== confirmPassword && (
            <div style={{ fontSize: 12, color: '#c62828', fontWeight: 600, marginTop: -8 }}>
              ⚠️ Passwords do not match
            </div>
          )}

          <button type="submit" style={styles.primaryButton} disabled={loading || !!successMsg}>
            {loading ? <div className="loading-spinner" /> : successMsg ? 'Password Updated ✓' : 'Save New Password'}
          </button>
        </form>

        <div style={{ ...styles.registerRow, ...(isMobile ? { marginTop: 8, fontSize: '13px' } : {}) }}>
          <Link to="/login" style={styles.link}>
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

function getRootStyles(isMobile: boolean): React.CSSProperties {
  return {
    minHeight: '100dvh',
    background: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isMobile ? '16px 10px' : '24px 16px',
    overflowX: 'hidden',
    overflowY: 'auto',
    boxSizing: 'border-box' as const,
    width: '100%',
  };
}

function getCardStyles(isMobile: boolean): React.CSSProperties {
  return {
    width: '100%',
    maxWidth: isMobile ? '100%' : 420,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: isMobile ? 2 : 16,
    padding: isMobile ? '20px 16px' : '32px 24px',
    boxShadow: isMobile
      ? '0 6px 24px -8px rgba(108, 99, 255, 0.18)'
      : '0 10px 40px -12px rgba(108, 99, 255, 0.18)',
    boxSizing: 'border-box' as const,
    margin: 'auto',
  };
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 'clamp(22px, 5vw, 28px)',
    fontWeight: 800,
    color: 'var(--text-primary)',
    margin: 0,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginTop: 6,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: 4,
    marginBottom: -4,
    display: 'block',
  },
  input: {
    width: '100%',
    background: '#FAFAFA',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '12px 42px 12px 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: 4,
  },
  primaryButton: {
    width: '100%',
    background: 'var(--primary-color)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 16px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
    display: 'grid',
    placeItems: 'center',
    minHeight: 46,
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
    boxSizing: 'border-box' as const,
  },
  errorBox: {
    background: 'var(--danger-bg)',
    color: 'var(--danger-color)',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    border: '1px solid var(--danger-color)',
    marginBottom: 4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.5,
    boxSizing: 'border-box' as const,
  },
  successBox: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: 14,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  registerRow: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  link: {
    color: 'var(--primary-color)',
    textDecoration: 'none',
    fontWeight: 700,
  },
};
