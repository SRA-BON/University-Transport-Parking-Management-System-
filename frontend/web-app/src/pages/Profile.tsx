import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Profile() {
  const { user, signIn } = useAuthStore();
  const [form, setForm] = useState({
    name: user?.name || '',
    department: user?.department || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        department: (user.department as string) || '',
      });
    }
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', {
        name: form.name,
        department: form.department || null,
      });
      signIn((window as any).authToken ?? localStorage.getItem('userToken') ?? '', res.data.user);
      setMsg('✅ Profile saved successfully');
    } catch (e: any) {
      setMsg('❌ Failed to save: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-page">
      <h2 style={styles.heading}>👤 Profile</h2>
      <p style={styles.sub}>Manage your account details</p>

      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.avatar}>{(user?.name || 'U').charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.name}>{user?.name}</div>
            <div style={styles.email}>{user?.email}</div>
            <div style={styles.pillRow}>
              <span style={{ ...styles.pill, background: '#EDE7F6', color: '#4527A0' }}>
                {user?.role?.toUpperCase()}
              </span>
              <span style={{ ...styles.pill, background: '#E3F2FD', color: '#1565C0' }}>
                ID: {user?.student_id}
              </span>
              {user?.no_show_count !== undefined && user.no_show_count > 0 && (
                <span style={{ ...styles.pill, background: '#FFF3E0', color: '#E65100' }}>
                  ⚠️ {user.no_show_count} No-show
                </span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={save} style={styles.form}>
          {msg && <div style={styles.msg}>{msg}</div>}

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Full Name</label>
              <input
                style={styles.input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label style={styles.label}>Email</label>
              <input style={styles.input} value={user?.email || ''} disabled />
            </div>
            <div>
              <label style={styles.label}>Student ID</label>
              <input style={styles.input} value={user?.student_id || ''} disabled />
            </div>
            <div>
              <label style={styles.label}>Department</label>
              <input
                style={styles.input}
                value={form.department}
                placeholder="e.g. CSE"
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>

          </div>

          <button type="submit" style={styles.saveBtn} disabled={saving}>
            {saving ? <div className="loading-spinner" /> : '💾 Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 24 },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: 28,
  },
  header: {
    display: 'flex',
    gap: 18,
    alignItems: 'center',
    paddingBottom: 20,
    marginBottom: 20,
    borderBottom: '1px solid var(--border-color)',
    flexWrap: 'wrap',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary-color), #8B83FF)',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 28,
    fontWeight: 800,
  },
  name: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  email: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginTop: 2,
  },
  pillRow: {
    display: 'flex',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  pill: {
    padding: '5px 11px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
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
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 14,
  },
  saveBtn: {
    alignSelf: 'flex-start',
    background: 'var(--primary-color)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px 22px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
    display: 'grid',
    placeItems: 'center',
    minWidth: 180,
    width: '100%',
    maxWidth: 240,
    minHeight: 44,
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
  },
  msg: {
    padding: '12px 14px',
    borderRadius: 8,
    background: 'var(--success-bg)',
    color: 'var(--success-text)',
    fontSize: 14,
    fontWeight: 600,
  },
};
