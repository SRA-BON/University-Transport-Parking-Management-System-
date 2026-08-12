import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CredentialResponse, GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();

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
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img 
            src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png" 
            alt="BRACU Logo" 
            style={{ width: '180px', marginBottom: '16px' }}
          />
          <h1 style={styles.title}>Welcome Back</h1>
          <p style={styles.subtitle}>Sign in to your BRACU Transport account</p>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={styles.label}>Password</label>
            <Link to="/forgot-password" style={{ ...styles.link, fontSize: '13px' }}>
              Forgot Password?
            </Link>
          </div>
          <input
            style={styles.input}
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
          />

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? <div className="loading-spinner" /> : 'Sign In'}
          </button>

          <div style={styles.dividerRow}>
            <div style={styles.divider} />
            <span style={styles.dividerText}>OR</span>
            <div style={styles.divider} />
          </div>

          <div style={styles.googleWrapper}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="filled_blue"
              shape="rectangular"
              width="400"
              text="continue_with"
              useOneTap
              auto_select={false}
            />
          </div>
          <p style={styles.googleHint}>
            Only <strong>@g.bracu.ac.bd</strong> emails are accepted for Google login
          </p>

          <div style={styles.registerRow}>
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

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'grid',
    placeItems: 'center',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: '32px 24px',
    boxShadow: '0 10px 40px -12px rgba(108, 99, 255, 0.18)',
  },
  header: {
    textAlign: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    display: 'grid',
    placeItems: 'center',
    fontSize: 28,
    background: 'linear-gradient(135deg, var(--primary-color) 0%, #8B83FF 100%)',
    margin: '0 auto 16px',
    color: '#fff',
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
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: 4,
    marginBottom: -4,
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
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '16px 0 4px',
  },
  divider: { flex: 1, height: 1, background: 'var(--border-color)' },
  dividerText: { fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 500 },
  googleWrapper: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginTop: 6,
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
