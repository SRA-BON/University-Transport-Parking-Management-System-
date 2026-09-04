import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', {
        email: email.trim(),
        frontendOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      setSuccessMsg(res.data?.message || 'If your email is registered, you will receive a password reset link shortly.');
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '22px' } : {}) }}>Forgot Password</h1>
          <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>
            Enter your registered email address and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {successMsg && <div style={styles.successBox}>{successMsg}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email Address</label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@g.bracu.ac.bd"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || !!successMsg}
            autoFocus
          />
          <button type="submit" style={styles.primaryButton} disabled={loading || !!successMsg}>
            {loading ? <div className="loading-spinner" /> : 'Send Password Reset Link'}
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
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
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
