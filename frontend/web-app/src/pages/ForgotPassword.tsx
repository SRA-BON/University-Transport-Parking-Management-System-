import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setSuccessMsg(res.data.message || 'OTP sent successfully.');
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setError('Please enter the OTP');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { email, otp });
      setSuccessMsg('OTP verified. Please enter your new password.');
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { email, otp, newPassword });
      setSuccessMsg(res.data.message || 'Password reset successfully.');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
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
          <h1 style={styles.title}>Forgot Password</h1>
          <p style={styles.subtitle}>
            {step === 1 && 'Enter your email to receive an OTP'}
            {step === 2 && 'Enter the 6-digit OTP sent to your email'}
            {step === 3 && 'Create a new password'}
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {successMsg && <div style={styles.successBox}>{successMsg}</div>}

        {step === 1 && (
          <form onSubmit={handleSendOtp} style={styles.form}>
            <label style={styles.label}>Email Address</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@g.bracu.ac.bd"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? <div className="loading-spinner" /> : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp} style={styles.form}>
            <label style={styles.label}>OTP Code</label>
            <input
              style={styles.input}
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={loading}
            />
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? <div className="loading-spinner" /> : 'Verify OTP'}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} style={styles.form}>
            <label style={styles.label}>New Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
            />
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? <div className="loading-spinner" /> : 'Reset Password'}
            </button>
          </form>
        )}

        <div style={styles.registerRow}>
          <Link to="/login" style={styles.link}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f6f8',
    padding: 20,
  },
  card: {
    background: '#fff',
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: '32px 24px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
  },
  header: {
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#1a1a1a',
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    marginBottom: -8,
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  primaryButton: {
    background: '#0052cc',
    color: '#fff',
    border: 'none',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
    display: 'flex',
    justifyContent: 'center',
  },
  errorBox: {
    background: '#ffebee',
    color: '#c62828',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  successBox: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  registerRow: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
  },
  link: {
    color: '#0052cc',
    textDecoration: 'none',
    fontWeight: 600,
  },
};
