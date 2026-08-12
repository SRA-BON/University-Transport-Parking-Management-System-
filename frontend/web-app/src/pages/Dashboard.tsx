import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

export default function Dashboard() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [balance, setBalance] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentBanner, setPaymentBanner] = useState<{ type: 'success' | 'fail' | 'cancelled'; amount?: string } | null>(null);

  const isManagement = user?.role === 'manager' || user?.role === 'developer' || user?.role === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isManagement) {
        const [routesRes, tripsRes] = await Promise.all([api.get('/routes'), api.get('/trips')]);
        const routes = routesRes.data.routes || [];
        const rawTrips = tripsRes.data.trips || [];
        const merged: Trip[] = rawTrips.map((t: any) => {
          const r = routes.find((x: any) => x.id === t.route_id);
          return { ...t, route_name: r ? r.name : 'Unknown Route' };
        });
        setTrips(merged);
      } else {
        const res = await api.get('/wallets');
        setBalance(parseFloat(res.data.balance) || 0);
      }
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    } finally {
      setLoading(false);
    }
  }, [isManagement]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Read SSLCommerz redirect result from URL query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment');
    const amount  = params.get('amount');
    if (payment === 'success' || payment === 'failed' || payment === 'cancelled') {
      const type = payment === 'success' ? 'success' : payment === 'cancelled' ? 'cancelled' : 'fail';
      setPaymentBanner({ type, amount: amount || undefined });
      // Auto-dismiss after 6 seconds
      const t = setTimeout(() => setPaymentBanner(null), 6000);
      // Clean the URL without reloading
      window.history.replaceState({}, '', '/');
      return () => clearTimeout(t);
    }
  }, [location.search]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return '#4CAF50';
      case 'in_progress':
        return '#2196F3';
      case 'completed':
        return '#9E9E9E';
      case 'delayed':
        return '#FF9800';
      case 'cancelled':
        return '#F44336';
      default:
        return '#666';
    }
  };

  if (isManagement) {
    return (
      <div className="app-page">
        <PaymentBanner banner={paymentBanner} onClose={() => setPaymentBanner(null)} />
        <header style={styles.headerRow}>
          <div>
            <h2 style={styles.heading}>Hello, {user?.name || 'Manager'} 👋</h2>
            <p style={styles.subHeading}>Management Dashboard</p>
          </div>
          <button onClick={loadData} style={styles.refreshBtn}>🔄 Refresh</button>
        </header>

        <div style={styles.statsGrid}>
          <CardStat label="Total Trips" value={trips.length} color="#6C63FF" />
          <CardStat label="Active Trips" value={trips.filter((t) => t.status === 'in_progress').length} color="#2196F3" />
          <CardStat label="Scheduled" value={trips.filter((t) => t.status === 'scheduled').length} color="#4CAF50" />
          <CardStat label="Completed" value={trips.filter((t) => t.status === 'completed').length} color="#666" />
        </div>


        <h3 style={{ ...styles.sectionTitle, marginTop: 28 }}>Recent Trips</h3>
        {loading ? (
          <div className="loading-spinner dark" style={{ marginTop: 12 }} />
        ) : trips.length === 0 ? (
          <EmptyState text="No trips yet. Add some in the Management panel." />
        ) : (
          <div style={styles.listGrid}>
            {trips.slice(0, 8).map((t) => (
              <div key={t.id} style={styles.tripCard}>
                <div>
                  <div style={styles.tripRoute}>{t.route_name}</div>
                  <div style={styles.tripMeta}>🚌 {t.bus_number} · 💺 {t.available_seats} seats</div>
                  <div style={styles.tripTime}>{new Date(t.departure_time).toLocaleString()}</div>
                </div>
                <span style={{ ...styles.badge, background: statusColor(t.status) }}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-page">
      <PaymentBanner banner={paymentBanner} onClose={() => setPaymentBanner(null)} />
      <header style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>Hello, {user?.name || 'Student'} 👋</h2>
          <p style={styles.subHeading}>
            Student ID: <strong>{user?.student_id}</strong>
          </p>
        </div>
        <button onClick={loadData} style={styles.refreshBtn}>🔄 Refresh</button>
      </header>

      <div style={styles.walletCard}>
        <div>
          <p style={styles.walletLabel}>Wallet Balance</p>
          <p style={styles.walletAmount}>৳ {balance.toFixed(2)}</p>
        </div>
        <Link to="/recharge" style={styles.topUpBtn}>+ Top Up Wallet</Link>
      </div>

      <h3 style={styles.sectionTitle}>Quick Actions</h3>
      <div style={styles.actionsGrid}>
        <Link to="/explore" style={styles.actionCard}>
          <span style={styles.actionIcon}>🚌</span>
          <span style={styles.actionTitle}>Find a Bus</span>
          <span style={styles.actionDesc}>Browse routes and times</span>
        </Link>
        <Link to="/parking" style={styles.actionCard}>
          <span style={styles.actionIcon}>🅿️</span>
          <span style={styles.actionTitle}>Parking</span>
          <span style={styles.actionDesc}>Entry, exit & history</span>
        </Link>
        <Link to="/bookings" style={styles.actionCard}>
          <span style={styles.actionIcon}>🎫</span>
          <span style={styles.actionTitle}>My Bookings</span>
          <span style={styles.actionDesc}>View active tickets</span>
        </Link>
        <Link to="/profile" style={styles.actionCard}>
          <span style={styles.actionIcon}>👤</span>
          <span style={styles.actionTitle}>Profile</span>
          <span style={styles.actionDesc}>Manage your account</span>
        </Link>
        <Link to="/recharge" style={styles.actionCard}>
          <span style={styles.actionIcon}>💳</span>
          <span style={styles.actionTitle}>Recharge</span>
          <span style={styles.actionDesc}>Add funds to wallet</span>
        </Link>
      </div>

      {user?.no_show_count && user.no_show_count > 0 ? (
        <div style={styles.warningCard}>
          <p style={styles.warningTitle}>⚠️ Penalty Notice</p>
          <p style={styles.warningText}>
            You have <strong>{user.no_show_count}</strong> recorded no-shows. Further no-shows may lead to account suspension.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CardStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={styles.empty}>
      <span style={{ fontSize: 32 }}>📭</span>
      <p style={{ marginTop: 8, color: '#666' }}>{text}</p>
    </div>
  );
}

function PaymentBanner({ banner, onClose }: {
  banner: { type: 'success' | 'fail' | 'cancelled'; amount?: string } | null;
  onClose: () => void;
}) {
  if (!banner) return null;

  const config = {
    success:   { bg: 'var(--success-bg)',  color: 'var(--success-text)', icon: '✅', text: banner.amount ? `Wallet recharged with ৳${parseFloat(banner.amount).toFixed(2)}!` : 'Wallet recharged successfully!' },
    fail:      { bg: 'var(--danger-bg)',   color: 'var(--danger-color)', icon: '❌', text: 'Payment failed. No charge was made.' },
    cancelled: { bg: 'var(--warning-bg)', color: 'var(--warning-text)', icon: '🚫', text: 'Payment was cancelled.' },
  }[banner.type];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '14px 18px', borderRadius: 12, marginBottom: 20,
      background: config.bg, color: config.color, fontWeight: 600, fontSize: 15,
      boxShadow: '0 4px 18px -6px rgba(0,0,0,0.15)',
    }}>
      <span>{config.icon} {config.text}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: config.color, fontSize: 20, lineHeight: 1, padding: '0 4px' }}
      >×</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  heading: {
    fontSize: 'clamp(20px, 4vw, 26px)',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  subHeading: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginTop: 4,
  },
  refreshBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
  },
  statCard: {
    background: 'var(--bg-card)',
    padding: 22,
    borderRadius: 14,
    border: '1px solid var(--border-color)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 800,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  primaryCta: {
    padding: '14px 20px',
    background: 'var(--primary-color)',
    color: '#fff',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    display: 'inline-block',
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 14,
  },
  listGrid: {
    display: 'grid',
    gap: 12,
  },
  tripCard: {
    background: 'var(--bg-card)',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    padding: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  tripRoute: {
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontSize: 15,
    marginBottom: 4,
  },
  tripMeta: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  tripTime: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  badge: {
    padding: '6px 12px',
    borderRadius: 999,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  walletCard: {
    background: 'linear-gradient(135deg, var(--primary-color) 0%, #8B83FF 100%)',
    borderRadius: 18,
    padding: '28px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    boxShadow: '0 10px 30px -10px rgba(108, 99, 255, 0.5)',
    flexWrap: 'wrap',
    gap: 16,
  },
  walletLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginBottom: 6,
  },
  walletAmount: {
    color: '#fff',
    fontSize: 'clamp(28px, 6vw, 38px)',
    fontWeight: 800,
  },
  topUpBtn: {
    background: 'rgba(255,255,255,0.18)',
    padding: '12px 18px',
    borderRadius: 10,
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  actionCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  actionDesc: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  warningCard: {
    marginTop: 10,
    background: 'var(--warning-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 16,
  },
  warningTitle: {
    fontWeight: 700,
    color: 'var(--warning-text)',
    marginBottom: 4,
    fontSize: 14,
  },
  warningText: {
    color: 'var(--warning-text)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  empty: {
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)',
    borderRadius: 14,
    padding: 40,
    textAlign: 'center',
    color: 'var(--text-secondary)',
  },
};
