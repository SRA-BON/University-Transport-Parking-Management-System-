import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

interface Trip {
  id: number;
  route_name: string;
  bus_number: string;
  departure_time: string;
  status: string;
  available_seats: number;
}

export default function AdminDashboard() {
  const { user } = useAuthStore();

  const isAllowed = ['super_admin', 'admin', 'manager', 'developer'].includes(user?.role || '');

  const [usersList, setUsersList] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student', department: '', password: '', studentId: '' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/users');
      setUsersList(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrips = useCallback(async () => {
    setTripsLoading(true);
    try {
      const [routesRes, tripsRes] = await Promise.all([api.get('/routes'), api.get('/trips')]);
      const routes = routesRes.data.routes || [];
      const rawTrips = tripsRes.data.trips || [];
      const merged: Trip[] = rawTrips.map((t: any) => {
        const r = routes.find((x: any) => x.id === t.route_id);
        return { ...t, route_name: r ? r.name : 'Unknown Route' };
      });
      setTrips(merged);
    } catch {
      // trips might not load for admin — ok
    } finally {
      setTripsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadTrips();
  }, [loadUsers, loadTrips]);

  const handleRefresh = () => { loadUsers(); loadTrips(); };

  const canEditUser = (targetRole: string) => {
    const currentUserRole = user?.role || '';
    if (targetRole === 'admin' && currentUserRole !== 'admin' && currentUserRole !== 'super_admin') return false;
    if (targetRole === 'manager' && currentUserRole !== 'admin' && currentUserRole !== 'super_admin') return false;
    return true;
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await api.put(`/admin/users/${userId}`, { is_active: !currentStatus });
      loadUsers();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalRole = newUser.role || 'student';
    if (finalRole === 'student' && newUser.studentId) {
      if (!/^(22|23)\d{6}$/.test(newUser.studentId.trim())) {
        alert('Student ID must be 8 digits starting with 22 or 23 (e.g. 22201297)');
        return;
      }
    }
    try {
      await api.post('/admin/users', {
        ...newUser,
        studentId: newUser.studentId || undefined,
      });
      setShowAddForm(false);
      setNewUser({ name: '', email: '', role: 'student', department: '', password: '', studentId: '' });
      loadUsers();
    } catch (e: any) {
      alert('Failed to add user: ' + (e.response?.data?.error || e.message));
    }
  };

  const filteredUsers = usersList.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.display_id?.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.student_id?.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return '#4CAF50';
      case 'in_progress': return '#2196F3';
      case 'completed': return '#9E9E9E';
      case 'delayed': return '#FF9800';
      case 'cancelled': return '#F44336';
      default: return '#666';
    }
  };

  const getIdLabel = (u: any) => {
    const id = u.display_id || u.student_id;
    if (!id) return '—';
    return id;
  };

  const getIdPrefix = (role: string) => {
    switch (role) {
      case 'student': return 'Student ID';
      case 'manager': return 'Manager ID';
      case 'bus_attendant': return 'Bus Att. ID';
      case 'parking_attendant': return 'Parking Att. ID';
      default: return 'ID';
    }
  };

  if (!isAllowed) {
    return (
      <div style={forbiddenStyles.wrap}>
        <div style={forbiddenStyles.card}>
          <div style={forbiddenStyles.icon}>🚫</div>
          <div style={forbiddenStyles.title}>⚠️ Forbidden: Insufficient permissions</div>
          <div style={forbiddenStyles.subtitle}>You do not have the required privileges to access the Admin Panel. Please contact an administrator if you believe this is an error.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <header style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>Hello, {user?.name || 'Admin'} 👋</h2>
          <p style={styles.subHeading}>Admin Dashboard — Management & Users</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowAddForm(!showAddForm)} style={styles.addBtn}>
            {showAddForm ? 'Cancel' : '+ Add User'}
          </button>
          <button onClick={handleRefresh} style={styles.refreshBtn}>🔄 Refresh</button>
        </div>
      </header>

      {/* Add User Form */}
      {showAddForm && (
        <form onSubmit={handleAddUser} style={styles.addForm}>
          <h3 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Create New User</h3>
          <div style={styles.formGrid}>
            <input style={styles.input} placeholder="Name *" required value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
            <input style={styles.input} placeholder="Email *" type="email" required value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
            <input style={styles.input} placeholder="Password (default: DefaultPass123!)" value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
            <select style={styles.input} value={newUser.role}
              onChange={e => setNewUser({ ...newUser, role: e.target.value, studentId: '' })}>
              {['admin', 'super_admin', 'manager'].includes(user?.role || '') && <option value="student">Student</option>}
              <option value="manager">Manager</option>
              <option value="bus_attendant">Bus Attendant</option>
              <option value="parking_attendant">Parking Attendant</option>
              {['admin', 'super_admin'].includes(user?.role || '') && <option value="admin">Admin</option>}
            </select>
            {newUser.role === 'student' && (
              <input style={styles.input} placeholder="Student ID (e.g. 22201297 — optional, auto-generated)"
                value={newUser.studentId} onChange={e => setNewUser({ ...newUser, studentId: e.target.value })}
                title="8-digit ID starting with 22 or 23" maxLength={8} />
            )}
            {newUser.role === 'manager' && (
              <input style={{ ...styles.input, background: '#f5f5f5', color: '#666' }}
                placeholder="Manager ID (auto-generated: 10xxx)" disabled />
            )}
            {newUser.role === 'bus_attendant' && (
              <input style={{ ...styles.input, background: '#f5f5f5', color: '#666' }}
                placeholder="Bus Attendant ID (auto-generated: 20xxx)" disabled />
            )}
            {newUser.role === 'parking_attendant' && (
              <input style={{ ...styles.input, background: '#f5f5f5', color: '#666' }}
                placeholder="Parking Attendant ID (auto-generated: 30xxx)" disabled />
            )}
            {newUser.role === 'admin' && (
              <input style={{ ...styles.input, background: '#f5f5f5', color: '#666' }}
                placeholder="Admin — no ID assigned" disabled />
            )}
            <input style={styles.input} placeholder="Department" value={newUser.department}
              onChange={e => setNewUser({ ...newUser, department: e.target.value })} />
            <button type="submit" style={styles.submitBtn}>Save User</button>
          </div>
        </form>
      )}


      {/* User Management Table */}
      <h3 style={{ ...styles.sectionTitle, marginTop: 28 }}>📋 User Management</h3>
      <div style={{ marginBottom: 16 }}>
        <input type="text" placeholder="Search users by name, email, ID, or role..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          style={{ ...styles.input, maxWidth: '400px' }} />
      </div>

      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 16 }} />
      ) : error ? (
        <div style={{ color: 'var(--danger-color)', background: 'var(--danger-bg)', padding: '16px 20px', borderRadius: 10, marginBottom: 16, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Role ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>No users found.</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{getIdPrefix(u.role)}</div>
                    {getIdLabel(u)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span style={styles.roleBadge}>{u.role.replace('_', ' ')}</span></td>
                  <td>
                    <span style={{ ...styles.statusBadge, background: u.is_active ? '#E8F5E9' : '#FFEBEE', color: u.is_active ? '#2E7D32' : '#C62828' }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={styles.btnRow}>
                      <button
                        style={{ ...styles.actionBtn, background: u.is_active ? '#F57C00' : '#43A047', opacity: canEditUser(u.role) ? 1 : 0.5, cursor: canEditUser(u.role) ? 'pointer' : 'not-allowed' }}
                        onClick={() => toggleUserStatus(u.id, u.is_active)}
                        disabled={!canEditUser(u.role)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        style={{ ...styles.actionBtn, background: '#D32F2F', opacity: canEditUser(u.role) ? 1 : 0.5, cursor: canEditUser(u.role) ? 'pointer' : 'not-allowed' }}
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
      )}
    </div>
  );
}

function CardStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.statCard}>
      <div style={{ fontSize: 32, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  heading: { fontSize: 'clamp(20px,4vw,26px)', fontWeight: 800, color: 'var(--text-primary)' },
  subHeading: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  refreshBtn: { padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 },
  addBtn: { padding: '10px 16px', borderRadius: 8, background: 'var(--primary-color)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 },
  statCard: { background: 'var(--bg-card)', padding: 22, borderRadius: 14, border: '1px solid var(--border-color)', textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 },
  listGrid: { display: 'grid', gap: 12, marginBottom: 32 },
  tripCard: { background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  tripRoute: { fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, marginBottom: 4 },
  tripMeta: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 },
  tripTime: { fontSize: 12, color: 'var(--text-tertiary)' },
  badge: { padding: '6px 12px', borderRadius: 999, color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' },
  empty: { background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 24 },
  addForm: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginBottom: 24, marginTop: 16 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  input: { padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' },
  submitBtn: { padding: 10, borderRadius: 8, background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' },
  tableWrap: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  roleBadge: { background: '#F3E5F5', color: '#7B1FA2', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' },
  statusBadge: { padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 },
  btnRow: { display: 'flex', gap: 8 },
  actionBtn: { color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
};

const forbiddenStyles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { maxWidth: 480, textAlign: 'center', padding: '40px 32px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 4px 24px rgba(198,40,40,0.08)' },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--danger-color)', marginBottom: 12 },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
};

import React from 'react';
