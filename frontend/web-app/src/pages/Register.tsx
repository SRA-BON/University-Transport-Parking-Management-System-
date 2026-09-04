import { useState, useEffect } from 'react';
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

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Please fill in Name, Email and Password');
      return;
    }
    if (!/^(22|23)\d{6}$/.test(form.studentId.trim())) {
      setError('Student ID must be 8 digits starting with 22 or 23 (e.g. 22201297).');
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
        student_id: form.studentId.trim(),
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
          <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '22px' } : {}) }}>Create Account</h1>
          <p style={{ ...styles.subtitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>
            Join the BRACU Transport System
          </p>
        </div>

        <form onSubmit={handleRegister} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={getGridStyles(isMobile)}>
            <div>
              <label style={styles.label}>Full Name *</label>
              <input style={styles.input} value={form.name} onChange={update('name')} placeholder="Your name" disabled={loading} />
            </div>
            <div>
              <label style={styles.label}>Student ID *</label>
              <input
                style={styles.input}
                value={form.studentId}
                onChange={update('studentId')}
                placeholder="e.g. 22201297"
                title="8-digit ID starting with 22 or 23"
                maxLength={8}
                disabled={loading}
                required
              />
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
              <div style={{ position: 'relative' }}>
                <input
                  style={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Choose a strong password"
                  value={form.password}
                  onChange={update('password')}
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
            <div style={{ width: '100%', maxWidth: isMobile ? '100%' : '400px', overflow: 'hidden' }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                theme="filled_blue"
                shape="rectangular"
                width={isMobile ? undefined : 400}
                text="signup_with"
                ux_mode="popup"
              />
            </div>
          </div>
          <p style={{ ...styles.googleHint, ...(isMobile ? { fontSize: '11px' } : {}) }}>
            Only <strong>@g.bracu.ac.bd</strong> emails accepted
          </p>

          <div style={{ ...styles.registerRow, ...(isMobile ? { marginTop: 8, fontSize: '13px' } : {}) }}>
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
    maxWidth: isMobile ? '100%' : 600,
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

function getGridStyles(isMobile: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: isMobile
      ? '1fr'
      : 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    width: '100%',
    boxSizing: 'border-box' as const,
  };
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    textAlign: 'center',
    marginBottom: 20,
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
    width: '100%',
    boxSizing: 'border-box' as const,
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
    boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
    marginTop: 4,
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
  input: {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 14,
    color: 'var(--text-primary)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    paddingRight: 40,
    boxSizing: 'border-box' as const,
    minWidth: 0,
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
    marginTop: 12,
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  link: {
    color: 'var(--primary-color)',
    fontWeight: 700,
  },
};
