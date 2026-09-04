import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

interface ParkingSession {
  id: number;
  user_id: number;
  vehicle_reg_no: string;
  digital_token: string;
  status: 'active' | 'completed';
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  fee: number | null;
  created_at: string;
  updated_at: string;
}

export default function Parking() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [capacity, setCapacity] = useState<any>(null);
  const [feeRate, setFeeRate] = useState<number>(10);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingResult, setParkingResult] = useState<{ type: 'success' | 'error' | 'warning'; message: string; detail?: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, activeRes, profRes, capRes, feeRes, walletRes] = await Promise.all([
        api.get('/parking/sessions').then(r => r).catch(err => {
          console.warn('[Parking] sessions fetch failed:', err.response?.status, err.message);
          return { data: { sessions: [] } };
        }),
        api.get('/parking/sessions/active').then(r => r).catch(err => {
          console.warn('[Parking] active-session fetch failed:', err.response?.status, err.message);
          return { data: { session: null } };
        }),
        api.get('/parking/profile').then(r => r).catch(() => ({ data: { profile: null } })),
        api.get('/parking/capacity').then(r => r).catch(() => ({ data: { capacity: { total_spots: 100, occupied_spots: 0 } } })),
        api.get('/parking/fee-rate').then(r => r).catch(() => ({ data: { ratePerHour: 10 } })),
        api.get('/wallets').then(r => r).catch(err => {
          console.warn('[Parking] wallet fetch failed:', err.response?.status, err.message);
          return { data: { balance: 0 } };
        }),
      ]);
      const rawSessions = Array.isArray(sessRes.data?.sessions) ? sessRes.data.sessions : [];
      setSessions(rawSessions.map((s: any) => ({
        ...s,
        fee: s.fee != null ? Number(s.fee) : null,
        duration_minutes: s.duration_minutes != null ? Number(s.duration_minutes) : null,
      })));
      const rawActive = activeRes.data?.session || null;
      if (rawActive) {
        setActiveSession({
          ...rawActive,
          fee: rawActive.fee != null ? Number(rawActive.fee) : null,
          duration_minutes: rawActive.duration_minutes != null ? Number(rawActive.duration_minutes) : null,
        });
      } else {
        setActiveSession(null);
      }
      setProfile(profRes.data?.profile || null);
      const cap = capRes.data?.capacity || capRes.data || {};
      setCapacity({
        id: cap.id,
        total_spots: Number(cap.total_spots) || 100,
        occupied_spots: Number(cap.occupied_spots) || 0,
        car_total_spots: Number(cap.car_total_spots) || 200,
        car_occupied_spots: Number(cap.car_occupied_spots) || 0,
        bike_total_spots: Number(cap.bike_total_spots) || 400,
        bike_occupied_spots: Number(cap.bike_occupied_spots) || 0,
      });
      setFeeRate(Number(feeRes.data?.ratePerHour ?? 10) || 10);
      const wData = walletRes.data;
      setWalletBalance(Number(wData?.balance) || 0);
    } catch (e) {
      console.error('[Parking] loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const carOccupancyPercent = (() => {
    const total = Number(capacity?.car_total_spots ?? 200) || 200;
    const occupied = Number(capacity?.car_occupied_spots ?? 0) || 0;
    return Math.round(Math.min(100, (occupied / total) * 100));
  })();

  const bikeOccupancyPercent = (() => {
    const total = Number(capacity?.bike_total_spots ?? 400) || 400;
    const occupied = Number(capacity?.bike_occupied_spots ?? 0) || 0;
    return Math.round(Math.min(100, (occupied / total) * 100));
  })();

  return (
    <div className="app-page">
      <header style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>🏛️ Parking Dashboard</h2>
          <p style={styles.subHeading}>
            Manage parking, view sessions & track your activity
          </p>
        </div>
        <button onClick={loadData} style={styles.refreshBtn}>
          🔄 Refresh
        </button>
      </header>

      {activeSession && (
        <div style={styles.activeBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, flexWrap: 'wrap' }}>
            <div style={styles.activeDot}>
              <span style={styles.pulse} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.activeTitle}>🚗 Active Parking Session</div>
              <div style={styles.activeMeta}>
                Token <strong>#{activeSession.digital_token}</strong> · Entry:{' '}
                <strong>{new Date(activeSession.entry_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</strong> ·{' '}
                Vehicle: <strong>{activeSession.vehicle_reg_no}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {!profile && (
        <div style={styles.setupBanner}>
          <span style={{ fontSize: 24 }}>🚙</span>
          <div style={{ flex: 1 }}>
            <p style={styles.setupTitle}>Complete Your Parking Setup</p>
            <p style={styles.setupText}>
              Link a vehicle registration number to start using automated parking entry & exit.
            </p>
          </div>
          <Link to="/parking/profile" style={styles.setupBtn}>
            ⚙️ Setup Profile
          </Link>
        </div>
      )}

      <div style={styles.statsGrid}>
        <StatCard
          icon="💳"
          label="Wallet Balance"
          value={`৳ ${walletBalance.toFixed(2)}`}
          gradient="linear-gradient(135deg, #6C63FF 0%, #4A3FFF 100%)"
          actionLabel="Top Up"
          actionHref="/recharge"
        />
        <StatCard
          icon="🚗"
          label="Vehicle Linked"
          value={profile?.vehicle_reg_no || 'Not linked'}
          gradient="linear-gradient(135deg, #00BCD4 0%, #0097A7 100%)"
          actionLabel={profile ? 'Update' : 'Link'}
          actionHref="/parking/profile"
          mono
        />
        <StatCard
          icon="🎫"
          label="Total Sessions"
          value={String(sessions.length)}
          gradient="linear-gradient(135deg, #FF9800 0%, #F57C00 100%)"
        />
        <StatCard
          icon="🚗"
          label="Car Parking"
          value={`${capacity?.car_occupied_spots ?? 0} / ${capacity?.car_total_spots ?? 200}`}
          gradient={
            carOccupancyPercent >= 85
              ? 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)'
              : carOccupancyPercent >= 60
              ? 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)'
              : 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)'
          }
          sub={`${carOccupancyPercent}% occupied`}
        />
        <StatCard
          icon="🏍️"
          label="Bike Parking"
          value={`${capacity?.bike_occupied_spots ?? 0} / ${capacity?.bike_total_spots ?? 400}`}
          gradient={
            bikeOccupancyPercent >= 85
              ? 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)'
              : bikeOccupancyPercent >= 60
              ? 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)'
              : 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)'
          }
          sub={`${bikeOccupancyPercent}% occupied`}
        />
      </div>

      <div style={styles.quickRow}>
        <h3 style={styles.sectionTitle}>Quick Actions</h3>
      </div>
      <div style={styles.actionsGrid}>
        <Link to="/parking/profile" style={styles.actionCard}>
          <div style={{ ...styles.actionIcon, background: 'linear-gradient(135deg, #E0F7FA, #B2EBF2)' }}>
            🚙
          </div>
          <div style={styles.actionTitle}>Parking Profile</div>
          <div style={styles.actionDesc}>Link/update vehicle registration number</div>
        </Link>
        <Link to="/recharge" style={styles.actionCard}>
          <div style={{ ...styles.actionIcon, background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' }}>
            💳
          </div>
          <div style={styles.actionTitle}>Recharge Wallet</div>
          <div style={styles.actionDesc}>Add funds for parking & transport payments</div>
        </Link>
        {/* Self-service parking scan — no ID input, uses logged-in student identity */}
        <div style={{ ...styles.actionCard, border: activeSession ? '2px solid #E65100' : '2px dashed #6C63FF' }}>
          <div style={{ ...styles.actionIcon, background: activeSession ? 'linear-gradient(135deg, #FFEBEE, #FFCDD2)' : 'linear-gradient(135deg, #EDE7F6, #D1C4E9)' }}>
            {activeSession ? '🛑' : '🅿️'}
          </div>
          <div style={{ ...styles.actionTitle, color: activeSession ? '#E65100' : '#6C63FF' }}>
            {activeSession ? 'Active Parking' : 'Start Parking'}
          </div>
          <div style={styles.actionDesc}>
            {activeSession
              ? `In since ${new Date(activeSession.entry_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} · Token #${activeSession.digital_token}`
              : 'Tap SCAN-entry to record your vehicle entry'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {!activeSession && (
              <button
                onClick={handleParkingScan}
                disabled={parkingLoading}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none',
                  background: parkingLoading ? '#ccc' : 'linear-gradient(135deg, #6C63FF 0%, #8B83FF 100%)',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                  cursor: parkingLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px -4px rgba(108,99,255,0.5)',
                }}
              >
                {parkingLoading ? '⏳' : '📡 SCAN-entry'}
              </button>
            )}
            {activeSession && (
              <button
                onClick={handleParkingScan}
                disabled={parkingLoading}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none',
                  background: parkingLoading ? '#ccc' : 'linear-gradient(135deg, #E65100 0%, #FF8A65 100%)',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                  cursor: parkingLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px -4px rgba(230,81,0,0.5)',
                }}
              >
                {parkingLoading ? '⏳' : '📡 SCAN-exit'}
              </button>
            )}
          </div>
          {parkingResult && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: parkingResult.type === 'success' ? '#E8F5E9' : parkingResult.type === 'warning' ? '#FFF8E1' : '#FFEBEE',
              color: parkingResult.type === 'success' ? '#2E7D32' : parkingResult.type === 'warning' ? '#E65100' : '#C62828',
            }}>
              {parkingResult.type === 'success' ? '✅ ' : parkingResult.type === 'warning' ? '⚠️ ' : '❌ '}{parkingResult.message}
              {parkingResult.detail && <div style={{ fontSize: 11, marginTop: 3, opacity: 0.85 }}>{parkingResult.detail}</div>}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={styles.sectionTitle}>📜 Parking History</h3>
        {loading ? (
          <div className="loading-spinner dark" style={{ marginTop: 20 }} />
        ) : sessions.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 44 }}>📭</span>
            <p style={styles.emptyTitle}>No Parking Sessions Yet</p>
            <p style={styles.emptyText}>
              Your first parking session will appear here. Start by setting up your profile and scanning at the entry.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              {!profile && (
                <Link to="/parking/profile" style={styles.emptyPrimary}>
                  ⚙️ Setup Parking Profile
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="responsive-table-container">
            <div style={styles.history}>
              <div style={styles.historyHeader}>
                <div style={styles.hColToken}>Token</div>
                <div style={styles.hColVehicle}>Vehicle</div>
                <div style={styles.hColTime}>Entry / Exit</div>
                <div style={styles.hColDuration}>Duration</div>
                <div style={styles.hColFee}>Fee</div>
                <div style={styles.hColStatus}>Status</div>
              </div>
              {sessions.map((s) => {
                const isActive = s.status === 'active';
                return (
                  <div key={s.id} style={{ ...styles.historyRow, background: isActive ? 'var(--warning-bg)' : 'var(--bg-card)' }}>
                    <div style={styles.hColToken}>
                      <span style={styles.tokenChip}>#{s.digital_token}</span>
                    </div>
                    <div style={styles.hColVehicle}>
                      <div style={styles.hVehicle}>{s.vehicle_reg_no}</div>
                    </div>
                    <div style={styles.hColTime}>
                      <div style={styles.hTimeRow}>
                        <span style={styles.hTimeLabelGreen}>▶</span>
                        <span>{new Date(s.entry_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      </div>
                      {s.exit_time ? (
                        <div style={{ ...styles.hTimeRow, marginTop: 4 }}>
                          <span style={styles.hTimeLabelRed}>■</span>
                          <span>{new Date(s.exit_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                      ) : (
                        <div style={{ ...styles.hTimeRow, marginTop: 4 }}>
                          <span style={styles.hTimeLabelGray}>⋯</span>
                          <span style={{ color: 'var(--warning-text)', fontWeight: 700 }}>In progress...</span>
                        </div>
                      )}
                    </div>
                    <div style={styles.hColDuration}>
                      {s.duration_minutes !== null
                        ? `${s.duration_minutes} min`
                        : isActive
                        ? <LiveClock entryTime={s.entry_time} />
                        : '—'}
                    </div>
                    <div style={styles.hColFee}>
                      {s.fee !== null ? (
                        <span style={styles.feeAmount}>৳ {Number(s.fee || 0).toFixed(2)}</span>
                      ) : isActive ? (
                        <span style={{ color: 'var(--warning-text)', fontSize: 12, fontWeight: 600 }}>Pending</span>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div style={styles.hColStatus}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: isActive ? 'var(--warning-bg)' : 'var(--success-bg)',
                          color: isActive ? 'var(--warning-text)' : 'var(--success-text)',
                        }}
                      >
                        {isActive ? '● Active' : '✓ Completed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  async function handleParkingScan() {
    setParkingLoading(true);
    setParkingResult(null);
    try {
      // No body needed — backend uses req.user.id from JWT to identify student
      const res = await api.post('/parking/self-scan', {});
      const action = res.data.action;
      const s = res.data;
      if (action === 'entry') {
        setParkingResult({
          type: 'success',
          message: `✅ Parking entry recorded!`,
          detail: `Vehicle: ${s.vehicle?.registration_no} · Token: ${s.entry?.digital_token}`,
        });
      } else {
        setParkingResult({
          type: 'success',
          message: `✅ Exit done · Fee: ৳${Number(s.bill?.fee || 0).toFixed(2)}`,
          detail: `Duration: ${s.session?.duration_minutes} min · Wallet: ৳${Number(s.wallet?.balance_after || 0).toFixed(2)}`,
        });
      }
      setTimeout(() => loadData(), 2000);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Parking scan failed.';
      setParkingResult({ type: 'error', message: msg });
    } finally {
      setParkingLoading(false);
    }
  }
}

function LiveClock({ entryTime }: { entryTime: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  const ms = now - new Date(entryTime).getTime();
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return (
    <span style={{ color: '#E65100', fontWeight: 700 }}>
      {mins} min
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  gradient,
  sub,
  actionLabel,
  actionHref,
  mono,
}: {
  icon: string;
  label: string;
  value: string;
  gradient: string;
  sub?: string;
  actionLabel?: string;
  actionHref?: string;
  mono?: boolean;
}) {
  return (
    <div style={{ ...styles.statCard, background: gradient }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={styles.statIcon}>{icon}</div>
        {actionLabel && actionHref && (
          <Link to={actionHref} style={styles.statAction}>
            {actionLabel} →
          </Link>
        )}
      </div>
      <div style={styles.statLabel}>{label}</div>
      <div
        style={{
          ...styles.statValue,
          fontFamily: mono ? 'monospace' : 'inherit',
          textTransform: mono ? 'uppercase' : 'none',
          fontSize: mono && value.length > 10 ? 18 : 28,
        }}
      >
        {value}
      </div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function InfoChip({ icon, title, value }: { icon: string; title: string; value: string }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipIcon}>{icon}</span>
      <div>
        <div style={styles.chipTitle}>{title}</div>
        <div style={styles.chipValue}>{value}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={styles.chipDivider} />;
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
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  subHeading: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
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
  activeBanner: {
    padding: '16px 20px',
    background: 'var(--warning-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: 'var(--warning-text)',
    position: 'relative',
    flexShrink: 0,
  },
  pulse: {
    position: 'absolute',
    inset: -6,
    borderRadius: '50%',
    background: 'rgba(245, 124, 0, 0.35)',
    animation: 'pulse 1.6s ease-out infinite',
  },
  activeTitle: { fontSize: 15, fontWeight: 800, color: 'var(--warning-text)' },
  activeMeta: { fontSize: 12, color: 'var(--warning-text)', marginTop: 2, fontWeight: 500 },
  bannerCta: {
    padding: '10px 16px',
    background: 'var(--danger-color)',
    color: '#fff',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 4px 12px -4px rgba(244, 67, 54, 0.5)',
  },
  setupBanner: {
    padding: '16px 20px',
    background: 'var(--primary-light)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  setupTitle: { fontSize: 14, fontWeight: 800, color: 'var(--primary-color)' },
  setupText: { fontSize: 12, color: 'var(--primary-color)', marginTop: 2 },
  setupBtn: {
    padding: '10px 16px',
    background: 'var(--primary-color)',
    color: '#fff',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    boxShadow: '0 4px 12px -4px rgba(108, 99, 255, 0.5)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    borderRadius: 18,
    padding: 22,
    color: '#fff',
    boxShadow: '0 8px 22px -10px rgba(0,0,0,0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.2)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 20,
    backdropFilter: 'blur(4px)',
  },
  statAction: {
    fontSize: 11,
    fontWeight: 800,
    color: '#fff',
    background: 'rgba(255,255,255,0.18)',
    padding: '5px 10px',
    borderRadius: 999,
    backdropFilter: 'blur(4px)',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.9,
    marginBottom: 4,
    fontWeight: 600,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.5,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statSub: {
    marginTop: 6,
    fontSize: 11,
    opacity: 0.85,
    fontWeight: 500,
  },
  quickRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginBottom: 14,
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
    width: 48,
    height: 48,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    fontSize: 22,
    marginBottom: 8,
  },
  actionTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  actionDesc: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
  infoStrip: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: '14px 18px',
    gap: 18,
    flexWrap: 'wrap',
  },
  chip: { display: 'flex', alignItems: 'center', gap: 10 },
  chipIcon: { fontSize: 18 },
  chipTitle: { fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 },
  chipValue: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginTop: 1 },
  chipDivider: { width: 1, height: 28, background: 'var(--border-color)' },
  empty: {
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)',
    borderRadius: 16,
    padding: 48,
    textAlign: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 12 },
  emptyText: { fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, margin: '8px auto 0', lineHeight: 1.5 },
  emptyPrimary: {
    padding: '12px 18px',
    background: 'var(--primary-color)',
    color: '#fff',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    display: 'inline-block',
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
  },
  emptySecondary: {
    padding: '12px 18px',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    display: 'inline-block',
    border: '1px solid var(--border-color)',
  },
  history: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  historyHeader: {
    display: 'flex',
    padding: '12px 18px',
    background: 'var(--bg-hover)',
    borderBottom: '1px solid var(--border-color)',
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyRow: {
    display: 'flex',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border-color)',
    alignItems: 'center',
    fontSize: 13,
    color: 'var(--text-primary)',
    transition: 'background 0.1s ease',
  },
  tokenChip: {
    fontFamily: 'monospace',
    fontWeight: 800,
    background: 'var(--primary-light)',
    color: 'var(--primary-color)',
    padding: '4px 10px',
    borderRadius: 8,
    fontSize: 12,
  },
  hVehicle: { fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 },
  hTimeRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' },
  hTimeLabelGreen: { color: 'var(--success-text)', fontWeight: 900 },
  hTimeLabelRed: { color: 'var(--danger-color)', fontWeight: 900 },
  hTimeLabelGray: { color: 'var(--text-tertiary)', fontWeight: 900 },
  feeAmount: { fontWeight: 800, color: 'var(--danger-color)', fontSize: 14 },
  statusBadge: {
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  hColToken: { flex: '0 0 90px' },
  hColVehicle: { flex: '1 1 140px', minWidth: 100 },
  hColTime: { flex: '2 2 220px', minWidth: 180 },
  hColDuration: { flex: '0 0 100px', fontWeight: 700 },
  hColFee: { flex: '0 0 100px' },
  hColStatus: { flex: '0 0 110px', display: 'flex', justifyContent: 'flex-end' },
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'grid', placeItems: 'center',
  zIndex: 9999, padding: 20,
};

const modalBox: React.CSSProperties = {
  width: 'min(440px, 100%)',
  background: 'var(--bg-card)',
  borderRadius: 14,
  padding: '20px 20px 16px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  border: '2px solid #6C63FF',
};

const modalCancelBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontWeight: 800, fontSize: 12,
  cursor: 'pointer',
};

const modalOkBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  color: '#fff',
  fontWeight: 800, fontSize: 12,
  boxShadow: '0 4px 14px rgba(108,99,255,0.3)',
  transition: 'background 0.15s ease',
};

