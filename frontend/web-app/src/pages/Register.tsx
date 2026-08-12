import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CredentialResponse, GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    studentId: '',
    department: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Please fill in Name, Email and Password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      console.log('📝 Register attempt with:', form);
      const res = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        student_id: form.studentId || undefined,
        department: form.department || undefined,
      });
      console.log('✅ Register success:', res.data);
      signIn(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('❌ Register failed:', err.response?.data || err.message);
      setError(
        err.response?.data?.error || err.response?.data?.details || err.message || 'Registration failed'
      );
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
      console.log('🔐 Google OAuth (register): received ID token');
      const res = await api.post('/auth/google', { idToken });
      signIn(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('❌ Google auth failed:', err.response?.data || err.message);
      const detail =
        err.response?.data?.error ||
        err.response?.data?.details ||
        err.response?.data?.message ||
        err.message ||
        'Google sign-up failed';
      setError(`${detail}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-up was cancelled or failed.');
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
          <h1 style={styles.title}>Create Account</h1>
          <p style={styles.subtitle}>Join the BRACU Transport System</p>
        </div>

        <form onSubmit={handleRegister} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.gridTwo}>
            <div>
              <label style={styles.label}>Full Name *</label>
              <input style={styles.input} value={form.name} onChange={update('name')} placeholder="Your name" disabled={loading} />
            </div>
            <div>
              <label style={styles.label}>Student ID</label>
              <input style={styles.input} value={form.studentId} onChange={update('studentId')} placeholder="e.g. 21201234" disabled={loading} />
            </div>
            <div>
              <label style={styles.label}>Email *</label>
              <input
                style={styles.input}
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="you@g.bracu.ac.bd"
                disabled={loading}
              />
            </div>
            <div>
              <label style={styles.label}>Department</label>
              <input style={styles.input} value={form.department} onChange={update('department')} placeholder="e.g. CSE" disabled={loading} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>Password *</label>
              <input
                style={styles.input}
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="Choose a strong password"
                disabled={loading}
              />
            </div>

          </div>

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? <div className="loading-spinner" /> : 'Create Account'}
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
              text="signup_with"
              useOneTap
            />
          </div>
          <p style={styles.googleHint}>
            Only <strong>@g.bracu.ac.bd</strong> emails accepted
          </p>

          <div style={styles.registerRow}>
            <span>Already have an account?</span>{' '}
            <Link to="/login" style={styles.link}>
              Sign In
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
    maxWidth: 600,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: '32px 24px',
    boxShadow: '0 10px 40px -12px rgba(108, 99, 255, 0.18)',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    fontSize: 26,
    background: 'linear-gradient(135deg, var(--primary-color) 0%, #8B83FF 100%)',
    margin: '0 auto 14px',
    color: '#fff',
  },
  title: {
    fontSize: 'clamp(20px, 5vw, 26px)',
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginBottom: 4,
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
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
  },
  errorBox: {
    background: 'var(--danger-bg)',
    color: 'var(--danger-color)',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    border: '1px solid var(--danger-color)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 14,
    color: 'var(--text-primary)',
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
    marginTop: 12,
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  link: {
    color: 'var(--primary-color)',
    fontWeight: 700,
  },
};
