import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'transactions'>('users');
  
  const [usersList, setUsersList] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student', department: '', password: '' });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'users') {
        const res = await api.get('/admin/users');
        setUsersList(res.data);
      } else {
        const res = await api.get('/wallets/all-transactions');
        setTransactions(res.data.transactions || []);
      }
    } catch (e: any) {
      console.error('Failed to load admin data', e);
      setError(e.response?.data?.error || e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchQuery('');
    loadData();
  }, [activeTab]);

  const canEditUser = (targetRole: string) => {
    const currentUserRole = user?.role || '';
    if (targetRole === 'developer') return false;
    if (targetRole === 'super_admin' && currentUserRole !== 'developer') return false;
    if (targetRole === 'manager' && !['developer', 'super_admin'].includes(currentUserRole)) return false;
    return true;
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await api.put(`/admin/users/${userId}`, { is_active: !currentStatus });
      loadData();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      loadData();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', newUser);
      setShowAddForm(false);
      setNewUser({ name: '', email: '', role: 'student', department: '', password: '' });
      loadData();
    } catch (e: any) {
      alert('Failed to add user: ' + (e.response?.data?.error || e.message));
    }
  };

  const filteredUsers = usersList.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.student_id?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTransactions = transactions.filter(t => 
    t.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>📋 Admin Panel</h2>
          <p style={styles.sub}>Manage Users and View System Transactions</p>
        </div>
        <button onClick={loadData} style={styles.refreshBtn}>🔄 Refresh</button>
      </div>

      <div style={styles.tabs}>
        <button 
          style={activeTab === 'users' ? styles.activeTabBtn : styles.tabBtn} 
          onClick={() => setActiveTab('users')}
        >
          👤 Users
        </button>
        <button 
          style={activeTab === 'transactions' ? styles.activeTabBtn : styles.tabBtn} 
          onClick={() => setActiveTab('transactions')}
        >
          💳 Transactions
        </button>
        {activeTab === 'users' && (
          <button 
            style={styles.addBtn}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : '+ Add User'}
          </button>
        )}
      </div>

      {showAddForm && activeTab === 'users' && (
        <form onSubmit={handleAddUser} style={styles.addForm}>
          <h3 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Create New User</h3>
          <div style={styles.formGrid}>
            <input 
              style={styles.input} 
              placeholder="Name *" 
              required 
              value={newUser.name} 
              onChange={e => setNewUser({...newUser, name: e.target.value})}
            />
            <input 
              style={styles.input} 
              placeholder="Email *" 
              type="email" 
              required 
              value={newUser.email} 
              onChange={e => setNewUser({...newUser, email: e.target.value})}
            />
            <input 
              style={styles.input} 
              placeholder="Password (default: DefaultPass123!)" 
              value={newUser.password} 
              onChange={e => setNewUser({...newUser, password: e.target.value})}
            />
            <select 
              style={styles.input} 
              value={newUser.role} 
              onChange={e => setNewUser({...newUser, role: e.target.value})}
            >
              {['super_admin', 'manager'].includes(user?.role || '') && (
                <option value="student">Student</option>
              )}
              <option value="manager">Manager</option>
              <option value="bus_attendant">Bus Attendant</option>
              <option value="parking_attendant">Parking Attendant</option>
              {['super_admin'].includes(user?.role || '') && (
                <option value="manager">Manager</option>
              )}
              {user?.role === 'super_admin' && (
                <option value="super_admin">Super Admin</option>
              )}
            </select>
            <input 
              style={styles.input} 
              placeholder="Department" 
              value={newUser.department} 
              onChange={e => setNewUser({...newUser, department: e.target.value})}
            />
            <button type="submit" style={styles.submitBtn}>Save User</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 16 }} />
      ) : error ? (
        <div style={{ color: 'var(--danger-color)', background: 'var(--danger-bg)', padding: '16px 20px', borderRadius: 10, marginBottom: 16, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder={`Search ${activeTab === 'users' ? 'users by name, email, ID, role' : 'transactions by name or description'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...styles.input, maxWidth: '400px' }}
            />
          </div>
          {activeTab === 'users' ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.student_id || 'N/A'}</td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span style={styles.roleBadge}>{u.role}</span>
                  </td>
                  <td>
                    <span style={{ 
                      ...styles.statusBadge, 
                      background: u.is_active ? '#E8F5E9' : '#FFEBEE', 
                      color: u.is_active ? '#2E7D32' : '#C62828' 
                    }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={styles.btnRow}>
                      <button 
                        style={{ 
                          ...styles.actionBtn, 
                          background: u.is_active ? '#F57C00' : '#43A047',
                          opacity: canEditUser(u.role) ? 1 : 0.5,
                          cursor: canEditUser(u.role) ? 'pointer' : 'not-allowed'
                        }} 
                        onClick={() => toggleUserStatus(u.id, u.is_active)}
                        disabled={!canEditUser(u.role)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button 
                        style={{ 
                          ...styles.actionBtn, 
                          background: '#D32F2F',
                          opacity: canEditUser(u.role) ? 1 : 0.5,
                          cursor: canEditUser(u.role) ? 'pointer' : 'not-allowed'
                        }} 
                        onClick={() => deleteUser(u.id)}
                        disabled={!canEditUser(u.role)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.user_name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{t.user_email}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: t.type === 'recharge' ? '#2E7D32' : '#C62828' }}>
                    {t.type === 'recharge' ? '+' : '-'} ৳{Number(t.amount).toFixed(2)}
                  </td>
                  <td>
                    <span style={styles.typeBadge}>{t.type}</span>
                  </td>
                  <td>{t.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  heading: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  refreshBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontWeight: 600,
  },
  addBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: 'var(--primary-color)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    marginLeft: 'auto',
  },
  tabs: {
    display: 'flex',
    gap: 12,
    marginBottom: 24,
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: 12,
  },
  tabBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 15,
  },
  activeTabBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: 'var(--primary-color, #6C63FF)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
  },
  tableWrap: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 800,
  },
  addForm: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
  },
  submitBtn: {
    padding: 10,
    borderRadius: 8,
    background: 'var(--primary-color)',
    color: '#fff',
    border: 'none',
    fontWeight: 700,
    cursor: 'pointer',
  },
  roleBadge: {
    background: '#F3E5F5',
    color: '#7B1FA2',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  typeBadge: {
    background: '#E0F7FA',
    color: '#006064',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  btnRow: {
    display: 'flex',
    gap: 8,
  },
  actionBtn: {
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
