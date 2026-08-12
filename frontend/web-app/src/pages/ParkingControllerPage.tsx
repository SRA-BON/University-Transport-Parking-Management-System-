import { useEffect, useState } from 'react';
import api from '../services/api';

export default function ParkingControllerPage() {
  const [capacity, setCapacity] = useState<any>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [capRes, actRes] = await Promise.all([
        api.get('/parking/capacity'),
        api.get('/parking/sessions/active').catch(() => ({ data: { sessions: [] } })),
      ]);
      setCapacity(capRes.data);
      setActiveSessions(actRes.data?.sessions || []);
    } catch (e) {
      console.error('Failed to load parking controller data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll every 10 seconds for real-time basement updates
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>🎛️ Basement Parking Controller</h2>
          <p style={styles.sub}>Real-time Occupancy & Monitoring</p>
        </div>
        <button onClick={loadData} style={styles.refreshBtn}>🔄 Refresh</button>
      </div>

      {loading && !capacity ? (
        <div className="loading-spinner dark" style={{ marginTop: 16 }} />
      ) : (
        <>
          <div style={styles.statsGrid}>
            <StatCard 
              label="Car Parking Available" 
              value={(capacity?.car_total_spots || 200) - (capacity?.car_occupied_spots || 0)} 
              color="#2E7D32" 
              icon="🚗" 
            />
            <StatCard 
              label="Car Parking Occupied" 
              value={capacity?.car_occupied_spots || 0} 
              color="#E65100" 
              icon="🚙" 
            />
            <StatCard 
              label="Bike Parking Available" 
              value={(capacity?.bike_total_spots || 400) - (capacity?.bike_occupied_spots || 0)} 
              color="#2E7D32" 
              icon="🏍️" 
            />
            <StatCard 
              label="Bike Parking Occupied" 
              value={capacity?.bike_occupied_spots || 0} 
              color="#E65100" 
              icon="🛵" 
            />
          </div>

          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Active Parking Sessions</h3>
          </div>

          <div style={{ marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="Search sessions by vehicle number or token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', maxWidth: '400px', fontSize: '14px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Vehicle Reg. No</th>
                  <th>Digital Token</th>
                  <th>Entry Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions
                  .filter((session) => 
                    session.vehicle_reg_no?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    session.digital_token?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((session) => (
                  <tr key={session.id}>
                    <td style={{ fontWeight: 600 }}>{session.vehicle_reg_no}</td>
                    <td><span style={styles.tokenBadge}>{session.digital_token}</span></td>
                    <td>{new Date(session.entry_time).toLocaleString()}</td>
                    <td>
                      <span style={styles.statusBadgeActive}>IN PARKING</span>
                    </td>
                  </tr>
                ))}
                {activeSessions.filter((session) => 
                    session.vehicle_reg_no?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    session.digital_token?.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>No matching active vehicles currently parked.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{ ...styles.statCard, borderLeft: `5px solid ${color}` }}>
      <div style={styles.statTop}>
        <span style={styles.statIcon}>{icon}</span>
        <span style={{ ...styles.statValue, color }}>{value}</span>
      </div>
      <div style={styles.statLabel}>{label}</div>
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    background: 'var(--bg-card)',
    padding: '20px 24px',
    borderRadius: 14,
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  statTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statIcon: { fontSize: 28 },
  statValue: { fontSize: 32, fontWeight: 900 },
  statLabel: { fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  tableWrap: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 600,
  },
  tokenBadge: {
    background: 'var(--bg-hover, #EAEAEA)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  statusBadgeActive: {
    background: '#FFF3E0',
    color: '#E65100',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 800,
  },
};
