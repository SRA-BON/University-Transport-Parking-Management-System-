import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CredentialResponse, GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

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

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      console.log('🔐 Manual login attempt for:', email);
      const res = await api.post('/auth/login', { email, password });
      console.log('✅ Manual login success');
      signIn(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('❌ Manual login failed:', err.response?.data || err.message);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      setError('Google did not return an ID token');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      console.log('🔐 Google OAuth: received ID token, sending to backend...');
      const res = await api.post('/auth/google', { idToken });
      console.log('✅ Backend Google auth success:', res.data.message);
      signIn(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('❌ Google OAuth backend failed:', err.response?.data || err.message);
      const detail =
        err.response?.data?.error ||
        err.response?.data?.details ||
        err.response?.data?.message ||
        err.message ||
        'Google login failed';
      const debug = err.response?.data?.debug;
      setError(`${detail}${debug ? ` (${debug})` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.error('❌ Google OAuth popup/flow failed');
    setError('Google sign-in was cancelled or failed. Please try again.');
  };

  return (
    <div style={getRootStyles(isMobile)}>
      <div style={getCardStyles(isMobile)}>
        <div style={styles.header}>
          <img
            src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png"
            alt="BRACU Logo"
            style={{
              width: isMobile ? '140px' : '180px',
              maxWidth: '100%',
              height: 'auto',
              marginBottom: isMobile ? '12px' : '16px',
            }}
          />
          <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '22px' } : {}) }}>Welcome Back</h1>
          <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>
            Sign in to your BRACU Safe Ride
          </p>
        </div>

        <form onSubmit={handleManualLogin} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <label style={styles.label}>Email Address</label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@g.bracu.ac.bd"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ ...styles.label, marginTop: 0 }}>Password</label>
            <Link to="/forgot-password" style={{ ...styles.link, fontSize: isMobile ? '12px' : '13px' }}>
              Forgot Password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              style={styles.input}
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
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

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? <div className="loading-spinner" /> : 'Sign In'}
          </button>

          <div style={styles.dividerRow}>
            <div style={styles.divider} />
            <span style={styles.dividerText}>OR</span>
            <div style={styles.divider} />
          </div>

          <div style={styles.googleWrapper}>
            <div style={{ width: '100%', maxWidth: isMobile ? '100%' : '400px', overflow: 'hidden' }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                theme="filled_blue"
                shape="rectangular"
                width={isMobile ? undefined : 400}
                text="continue_with"
                useOneTap
                auto_select={false}
              />
            </div>
          </div>
          <p style={{ ...styles.googleHint, ...(isMobile ? { fontSize: '11px' } : {}) }}>
            Only <strong>@g.bracu.ac.bd</strong> emails are accepted for Google login
          </p>

          <div style={{ ...styles.registerRow, ...(isMobile ? { marginTop: 8, fontSize: '13px' } : {}) }}>
            <span>Don&apos;t have an account?</span>{' '}
            <Link to="/register" style={styles.link}>
              Sign Up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function getRootStyles(isMobile: boolean): React.CSSProperties {
  return {
    minHeight: '100dvh',
    background: 'var(--bg-primary)',
    display: 'flex',
    alignItems: isMobile ? 'center' : 'flex-start',
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
    maxWidth: isMobile ? '100%' : 440,
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
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
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
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    paddingRight: 40,
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
    color: 'var(--text-secondary)',
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
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '16px 0 4px',
    minWidth: 0,
  },
  divider: { flex: 1, height: 1, background: 'var(--border-color)', minWidth: 0 },
  dividerText: { fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 500, flexShrink: 0 },
  googleWrapper: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginTop: 6,
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  googleHint: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-tertiary)',
    marginTop: 6,
  },
  registerRow: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  link: {
    color: 'var(--primary-color)',
    fontWeight: 700,
  },
};
