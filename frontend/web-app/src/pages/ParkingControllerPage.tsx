import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useRFIDStore } from '../store/rfidStore';
import { syncService } from '../services/SyncService';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useAuthStore } from '../store/authStore';

export default function ParkingControllerPage() {
  const { user } = useAuthStore();
  const isParkingAllowed = ['super_admin', 'admin', 'manager', 'developer', 'parking_attendant'].includes(user?.role || '');
  const isManager = isParkingAllowed;

  if (!isParkingAllowed) {
    return (
      <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      padding: '40px 32px',
      textAlign: 'center',
      maxWidth: 520,
      margin: '60px auto',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ color: 'var(--danger-color)', margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Forbidden: Insufficient permissions</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        You do not have permission to access the Parking Controller page. This area is restricted to Parking Attendants and Management staff only.
      </p>
    </div>
    );
  }

  const [capacity, setCapacity] = useState<any>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [recentExits, setRecentExits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string; detail?: string } | null>(null);
  const { isOnline, pendingCount } = useOfflineSync();
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showMessage = (type: 'success' | 'error' | 'warning', text: string, detail?: string) => {
    setScanMessage({ type, text, detail });
    setTimeout(() => setScanMessage(null), 6000);
  };

  const processRfid = useCallback(async (rfid: string) => {
    try {
      if (!navigator.onLine) throw new Error('OFFLINE_CACHE');
      const res = await api.post('/parking/scan', { rfidId: rfid });
      const action = res.data.action;
      const s = res.data;

      if (action === 'entry') {
        showMessage(
          'success',
          `Entry recorded for ${s.student?.name} (${s.student?.student_id})`,
          `Vehicle: ${s.vehicle?.registration_no} · Token: ${s.entry?.digital_token}`
        );
      } else {
        showMessage(
          'success',
          `Exit processed for ${s.student?.name} · Fee: ৳${Number(s.bill?.fee || 0).toFixed(2)}`,
          `Duration: ${s.session?.duration_minutes} min · Wallet balance: ৳${Number(s.wallet?.balance_after || 0).toFixed(2)}`
        );
        setRecentExits(prev => [{ ...s, exitedAt: new Date() }, ...prev.slice(0, 4)]);
      }
      loadData();
    } catch (err: any) {
      if (err.message === 'OFFLINE_CACHE' || err.code === 'ERR_NETWORK' || !err.response) {
        syncService.addScan({ type: 'parking_scan', rfid_id: rfid });
        showMessage('warning', `Offline. Scan saved locally and will auto-detect entry/exit when synced.`);
      } else {
        showMessage('error', err.response?.data?.error || `Failed to process scan`);
      }
    }
  }, []);

  const handleScan = useCallback(async (rfid: string) => {
    await processRfid(rfid);
  }, [processRfid]);

  const { setActiveHandler } = useRFIDStore();

  useEffect(() => {
    setActiveHandler(handleScan);
    return () => setActiveHandler(null);
  }, [handleScan, setActiveHandler]);

  const loadData = async () => {
    setLoading(true);
    try {
      const endpoint = isManager ? '/parking/sessions/all' : '/parking/sessions/active';
      const [capRes, actRes] = await Promise.all([
        api.get('/parking/capacity').catch(err => {
          console.warn('[Parking] capacity fetch failed:', err.response?.status, err.message);
          return { data: { car_total_spots: 200, car_occupied_spots: 0, bike_total_spots: 400, bike_occupied_spots: 0 } };
        }),
        api.get(endpoint).catch(err => {
          console.warn('[Parking] sessions fetch failed:', err.response?.status, err.message, err.response?.data);
          return { data: { sessions: [] } };
        }),
      ]);
      const capData = capRes.data?.capacity || capRes.data || {};
      setCapacity({
        id: capData.id,
        car_total_spots: Number(capData.car_total_spots ?? 200) || 200,
        car_occupied_spots: Number(capData.car_occupied_spots ?? 0) || 0,
        bike_total_spots: Number(capData.bike_total_spots ?? 400) || 400,
        bike_occupied_spots: Number(capData.bike_occupied_spots ?? 0) || 0,
      });
      const rawSessions = actRes.data?.sessions || [];
      setActiveSessions(rawSessions.map((s: any) => ({
        ...s,
        duration_minutes_so_far: s.duration_minutes_so_far != null ? Number(s.duration_minutes_so_far) : null,
        fee: s.fee != null ? Number(s.fee) : null,
      })));
    } catch (e: any) {
      console.error('[Parking] Failed to load parking data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [isManager]);

  const filtered = activeSessions.filter(s =>
    s.vehicle_reg_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.digital_token?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.student_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const carOccupied = capacity?.car_occupied_spots ?? 0;
  const carTotal = capacity?.car_total_spots ?? 200;
  const bikeOccupied = capacity?.bike_occupied_spots ?? 0;
  const bikeTotal = capacity?.bike_total_spots ?? 400;

  return (
    <div className="app-page">
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>Parking Controller</h2>
          {!isOnline && (
            <div style={styles.offlineBadge}>
              OFFLINE — {pendingCount} scans pending sync
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={loadData} style={styles.refreshBtn}>Refresh</button>
        </div>
      </div>

      {/* Scan Result Notification */}
      {scanMessage && (
        <div style={{
          padding: '14px 18px', marginBottom: 20, borderRadius: 12, fontWeight: 600,
          background: scanMessage.type === 'success' ? '#E8F5E9' : scanMessage.type === 'warning' ? '#FFF8E1' : '#FFEBEE',
          color: scanMessage.type === 'success' ? '#2E7D32' : scanMessage.type === 'warning' ? '#E65100' : '#C62828',
          border: `1px solid ${scanMessage.type === 'success' ? '#A5D6A7' : scanMessage.type === 'warning' ? '#FFCC80' : '#EF9A9A'}`,
        }}>
          <div>{scanMessage.text}</div>
          {scanMessage.detail && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{scanMessage.detail}</div>}
        </div>
      )}

      {loading && !capacity ? (
        <div className="loading-spinner dark" style={{ marginTop: 16 }} />
      ) : (
        <>
          {/* Capacity Stats — Compact Size */}
          <div style={{ ...styles.statsGrid, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
            <StatCard label="Cars Parked" value={carOccupied} total={carTotal} color="#1565C0" isMobile={isMobile} />
            <StatCard label="Car Spots Free" value={carTotal - carOccupied} total={carTotal} color="#2E7D32" isMobile={isMobile} />
            <StatCard label="Bikes Parked" value={bikeOccupied} total={bikeTotal} color="#E65100" isMobile={isMobile} />
            <StatCard label="Bike Spots Free" value={bikeTotal - bikeOccupied} total={bikeTotal} color="#2E7D32" isMobile={isMobile} />
          </div>

          {/* Active Parking Sessions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: 12, gap: isMobile ? 8 : 0 }}>
            <h3 style={styles.sectionTitle}>Active Parking Sessions ({filtered.length})</h3>
            <input
              type="text"
              placeholder="Search vehicle, student, token..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', width: isMobile ? '100%' : 280, boxSizing: 'border-box' }}
            />
          </div>

          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 10, border: '1px dashed var(--border-color)' }}>No active parking sessions found.</div>
              )}
              {filtered.map(session => (
                <div key={session.id} style={styles.mobileCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{session.student_name || 'Unknown Student'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {session.student_id || '—'}{session.department ? ` · ${session.department}` : ''}
                      </div>
                    </div>
                    <span style={styles.activeBadge}>IN PARKING</span>
                  </div>
                  <div style={styles.mobileRow}>
                    <span style={styles.mobileLabel}>Vehicle:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{session.vehicle_reg_no}</span>
                  </div>
                  <div style={styles.mobileRow}>
                    <span style={styles.mobileLabel}>Token:</span>
                    <span style={styles.tokenBadge}>{session.digital_token}</span>
                  </div>
                  <div style={styles.mobileRow}>
                    <span style={styles.mobileLabel}>Entry:</span>
                    <span style={{ fontSize: 12 }}>
                      {new Date(session.entry_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                  <div style={styles.mobileRow}>
                    <span style={styles.mobileLabel}>Duration:</span>
                    <span style={{ fontWeight: 700, color: '#1565C0', fontSize: 13 }}>
                      {session.duration_minutes_so_far != null
                        ? `${Math.floor(Number(session.duration_minutes_so_far))} min`
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    <th style={styles.th}>Student</th>
                    <th style={styles.th}>Vehicle Reg. No</th>
                    <th style={styles.th}>Token</th>
                    <th style={styles.th}>Entry Time</th>
                    <th style={styles.th}>Duration</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(session => (
                    <tr key={session.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>
                        <div>{session.student_name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{session.student_id || ''}{session.department ? ` · ${session.department}` : ''}</div>
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 700 }}>{session.vehicle_reg_no}</td>
                      <td style={styles.td}><span style={styles.tokenBadge}>{session.digital_token}</span></td>
                      <td style={{ ...styles.td, fontSize: 13 }}>{new Date(session.entry_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#1565C0' }}>
                        {session.duration_minutes_so_far != null
                          ? `${Math.floor(Number(session.duration_minutes_so_far))} min`
                          : '—'}
                      </td>
                      <td style={styles.td}><span style={styles.activeBadge}>IN PARKING</span></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>No active parking sessions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Exits (in-memory, this session only) */}
          {recentExits.length > 0 && (
            <>
              <h3 style={{ ...styles.sectionTitle, marginTop: 28, marginBottom: 12 }}>Recent Exits (this session)</h3>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recentExits.map((e, i) => (
                    <div key={i} style={styles.mobileCard}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 6 }}>{e.student?.name}</div>
                      <div style={styles.mobileRow}>
                        <span style={styles.mobileLabel}>ID:</span>
                        <span style={{ fontSize: 12 }}>{e.student?.student_id}</span>
                      </div>
                      <div style={styles.mobileRow}>
                        <span style={styles.mobileLabel}>Vehicle:</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.vehicle?.registration_no}</span>
                      </div>
                      <div style={styles.mobileRow}>
                        <span style={styles.mobileLabel}>Duration:</span>
                        <span style={{ fontSize: 12 }}>{Number(e.session?.duration_minutes) || 0} min</span>
                      </div>
                      <div style={styles.mobileRow}>
                        <span style={styles.mobileLabel}>Fee:</span>
                        <span style={{ fontWeight: 700, color: '#C62828' }}>৳{Number(e.bill?.fee || 0).toFixed(2)}</span>
                      </div>
                      <div style={styles.mobileRow}>
                        <span style={styles.mobileLabel}>Wallet:</span>
                        <span style={{ fontWeight: 700, color: '#2E7D32' }}>৳{Number(e.wallet?.balance_after || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        <th style={styles.th}>Student</th>
                        <th style={styles.th}>Vehicle</th>
                        <th style={styles.th}>Duration</th>
                        <th style={styles.th}>Fee Paid</th>
                        <th style={styles.th}>Wallet After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentExits.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ ...styles.td, fontWeight: 600 }}>
                            <div>{e.student?.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.student?.student_id}</div>
                          </td>
                          <td style={{ ...styles.td, fontFamily: 'monospace' }}>{e.vehicle?.registration_no}</td>
                          <td style={styles.td}>{Number(e.session?.duration_minutes) || 0} min</td>
                          <td style={{ ...styles.td, color: '#C62828', fontWeight: 700 }}>৳{Number(e.bill?.fee || 0).toFixed(2)}</td>
                          <td style={{ ...styles.td, color: '#2E7D32', fontWeight: 700 }}>৳{Number(e.wallet?.balance_after || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, total, color, isMobile }: { label: string; value: number; total: number; color: string; isMobile?: boolean }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{
      background: 'var(--bg-card)',
      padding: isMobile ? '8px 10px' : '10px 12px',
      borderRadius: 6,
      border: '1px solid var(--border-color)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: isMobile ? 3 : 4 }}>
        <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
        <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
      </div>
      <div style={{ height: 3, borderRadius: 99, background: 'var(--border-color)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      {!isMobile && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>{value} / {total}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  offlineBadge: { marginTop: 8, display: 'inline-block', padding: '4px 10px', background: '#FF9800', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700 },
  refreshBtn: { padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  rfidStatus: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '2px solid #1565C0', borderRadius: 12, padding: '14px 20px', marginBottom: 24 },
  scanPulse: { width: 12, height: 12, borderRadius: '50%', background: '#1565C0', flexShrink: 0, boxShadow: '0 0 0 4px rgba(21,101,192,0.25)' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  tableWrap: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, overflowX: 'auto', marginBottom: 8 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 'max-content' },
  th: { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 },
  td: { padding: '9px 12px', fontSize: 13, verticalAlign: 'middle', color: 'var(--text-primary)' },
  tokenBadge: { background: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 800, fontSize: 13 },
  activeBadge: { background: '#E8F5E9', color: '#2E7D32', padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' },
  mobileCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    padding: '12px 14px',
  },
  mobileRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderTop: '1px dashed var(--border-color)',
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
};
