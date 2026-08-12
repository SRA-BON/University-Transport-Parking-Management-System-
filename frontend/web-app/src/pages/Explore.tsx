import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  scheduled:   { bg: '#E8F5E9', color: '#2E7D32' },
  in_progress: { bg: '#E3F2FD', color: '#1565C0' },
  completed:   { bg: '#F5F5F5', color: '#555' },
  cancelled:   { bg: '#FFEBEE', color: '#C62828' },
};

export default function Explore() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [trips, setTrips]     = useState<any[]>([]);
  const [routes, setRoutes]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [activeBookingMsg, setActiveBookingMsg] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  // Multi-select state
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Bulk action dropdown
  const [bulkOpen, setBulkOpen]         = useState(false);
  const [statusHover, setStatusHover]   = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);

  const canUpdateStatus = ['super_admin', 'manager', 'developer', 'admin', 'bus_attendant'].includes(user?.role || '');
  const canManageTrips  = ['super_admin', 'manager', 'developer', 'admin'].includes(user?.role || '');
  const canModifyTrip   = canUpdateStatus || ['bus_attendant'].includes(user?.role || '');
  const isStudent       = user?.role === 'student';

  // Close bulk dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkOpen(false);
        setStatusHover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, tripsRes] = await Promise.all([
        api.get('/routes'),
        api.get('/trips'),
      ]);
      const fetchedRoutes = routesRes.data.routes || [];
      setRoutes(fetchedRoutes);

      const rawTrips = tripsRes.data.trips || [];
      const merged = rawTrips.map((t: any) => {
        const r = fetchedRoutes.find((x: any) => x.id === t.route_id);
        return {
          ...t,
          route: r || {
            name: t.route_name,
            direction: t.direction,
            single_trip_fare: t.single_trip_fare,
          },
        };
      });
      setTrips(merged);
      setSelected(new Set()); // clear selection on reload
    } catch (e) {
      console.error('Failed to load trips', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!isStudent) { setActiveBookingMsg(null); return; }
    (async () => {
      try {
        const res = await api.get('/bookings/active/summary');
        const ab = res.data.activeBooking;
        if (ab) {
          setActiveBookingMsg(
            `⚠️ You already have an active booking for ${new Date(ab.trip?.departure_time || ab.departure_time).toLocaleString()}. ` +
            `Only one future trip is allowed — cancel that booking first to book another.`
          );
        } else {
          setActiveBookingMsg(null);
        }
      } catch { /* ignore */ }
    })();
  }, [isStudent, trips.length]);

  const getTripTimingInfo = (t: any) => {
    const depart = new Date(t.departure_time);
    const minsToDepart = (depart.getTime() - now.getTime()) / 60000;
    const bookingWindowMins = Number(t.route?.booking_window_minutes ?? 180);
    const freeCancelMins = Number(t.route?.free_cancel_minutes ?? 60);
    const penalty = Number(t.route?.emergency_cancel_penalty ?? 50);
    const grace = Number(t.route?.no_show_grace_minutes ?? 5);

    const bookable = minsToDepart > 0 && minsToDepart <= bookingWindowMins;
    return { minsToDepart, bookingWindowMins, freeCancelMins, penalty, grace, bookable };
  };

  const filtered = trips.filter((t) =>
    (t.route?.name || t.route_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (t.bus_number || '').toLowerCase().includes(filter.toLowerCase())
  );

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((t) => t.id)));
  const clearAll  = () => setSelected(new Set());
  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));

  // ── Individual actions ────────────────────────────────────────────────────
  const bookTrip = async (tripId: number) => {
    const trip = trips.find((t) => t.id === tripId);
    const ti = getTripTimingInfo(trip);
    if (!ti.bookable) {
      alert(`❌ Booking opens ${ti.bookingWindowMins / 60}h before departure.\n\nCurrent time: ${now.toLocaleString()}\nDeparture: ${new Date(trip.departure_time).toLocaleString()}`);
      return;
    }
    if (!confirm('Confirm booking for this trip?\n\n' +
      `Booking rules:\n` +
      `• 3-hour booking window (opens 3h before departure)\n` +
      `• Cancellation FREE up to 1h before departure\n` +
      `• Cancellations inside 1h: ${ti.penalty} BDT emergency penalty\n` +
      `• No-show (not scanned within ${ti.grace} min of departure): full fare kept + counted in no-show history\n` +
      `• Exactly ONE active booking per student — cancel first to book another.`)) return;
    try {
      const res = await api.post('/bookings', { tripId: tripId });
      alert('✅ Booking confirmed!\n\n' +
        `Route: ${trip.route?.name || trip.route_name}\n` +
        `Departure: ${new Date(trip.departure_time).toLocaleString()}\n\n` +
        'Don\'t forget to scan your RFID card at the bus gate — otherwise you will be marked as NO-SHOW.'
      );
      loadData();
    } catch (e: any) {
      alert('❌ Failed to book: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleUpdateStatus = async (tripId: number, status: string) => {
    try {
      await api.put(`/trips/${tripId}/status`, { status });
      loadData();
    } catch (e: any) {
      alert('❌ Failed to update status: ' + (e.response?.data?.error || e.message));
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const bulkUpdateStatus = async (status: string) => {
    setBulkOpen(false);
    setStatusHover(false);
    if (selected.size === 0) return;
    if (!confirm(`Update ${selected.size} trip(s) to "${status}"?`)) return;
    try {
      await Promise.all([...selected].map((id) => api.put(`/trips/${id}/status`, { status })));
      loadData();
    } catch (e: any) {
      alert('❌ Bulk status update failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const bulkDelete = async () => {
    setBulkOpen(false);
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected trip(s)? This cannot be undone.`)) return;
    try {
      await Promise.all([...selected].map((id) => api.delete(`/trips/${id}`)));
      loadData();
    } catch (e: any) {
      alert('❌ Bulk delete failed: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="app-page">
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>🚌 Explore Trips</h2>
          <p style={styles.sub}>Browse available buses and book your ride</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Search route or bus..."
            style={styles.search}
          />
        </div>
      </div>

      {activeBookingMsg && (
        <div style={styles.ruleNotice}>
          {activeBookingMsg}
        </div>
      )}

      {/* ── Bulk Action Toolbar (non-students only) ── */}
      {canUpdateStatus && !loading && filtered.length > 0 && (
        <div style={styles.toolbar}>
          {/* Select All checkbox */}
          <label style={styles.selectAllLabel}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => allSelected ? clearAll() : selectAll()}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>Select All</span>
          </label>

          {/* Selection counter */}
          <span style={styles.counter}>
            {selected.size > 0
              ? `${selected.size} of ${filtered.length} selected`
              : `${filtered.length} trips`}
          </span>

          {/* Bulk Actions Dropdown */}
          {selected.size > 0 && (
            <div ref={bulkRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setBulkOpen((p) => !p)}
                style={styles.bulkBtn}
              >
                Bulk Actions ▾
              </button>

              {bulkOpen && (
                <div style={styles.dropdown}>
                  {/* Update Status → submenu on hover */}
                  <div
                    style={styles.dropdownItem}
                    onMouseEnter={() => setStatusHover(true)}
                    onMouseLeave={() => setStatusHover(false)}
                  >
                    <span>🔄 Update Status</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11 }}>▸</span>

                    {statusHover && (
                      <div style={styles.submenu}>
                        {(['scheduled', 'in_progress', 'completed', 'cancelled'] as const).map((s) => (
                          <div
                            key={s}
                            style={{
                              ...styles.submenuItem,
                              color: STATUS_COLORS[s].color,
                            }}
                            onClick={() => bulkUpdateStatus(s)}
                          >
                            <span style={{
                              display: 'inline-block',
                              width: 8, height: 8,
                              borderRadius: '50%',
                              background: STATUS_COLORS[s].color,
                              marginRight: 8,
                            }} />
                            {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {canManageTrips && (
                    <div style={{ ...styles.dropdownItem, color: '#C62828' }} onClick={bulkDelete}>
                      🗑️ Delete Selected
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selected.size > 0 && (
            <button onClick={clearAll} style={styles.clearBtn}>✕ Clear</button>
          )}
        </div>
      )}

      {/* ── Trip Cards ── */}
      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 20 }} />
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <span style={{ fontSize: 32 }}>🚌</span>
          <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>No trips match your search.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((t) => {
            const isSelected = selected.has(t.id);
            const sc = STATUS_COLORS[t.status] || STATUS_COLORS.completed;
            const ti = getTripTimingInfo(t);
            return (
              <div
                key={t.id}
                style={{
                  ...styles.card,
                  outline: isSelected ? '2px solid var(--primary-color)' : '2px solid transparent',
                  boxShadow: isSelected ? '0 0 0 4px rgba(108,99,255,0.12)' : undefined,
                }}
              >
                {/* Card Header: Checkbox + Route Name */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  {canUpdateStatus && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(t.id)}
                      style={{ width: 16, height: 16, marginTop: 3, cursor: 'pointer', flexShrink: 0 }}
                    />
                  )}
                  <div style={styles.routeName}>{t.route?.name || t.route_name || 'Unknown Route'}</div>
                </div>

                <div style={styles.routeTags}>
                  <span style={styles.tag}>{t.route?.direction || t.direction || '-'}</span>
                </div>

                <div style={styles.divider} />

                <div style={styles.infoRow}>
                  <div>
                    <div style={styles.infoLabel}>Bus</div>
                    <div style={styles.infoValue}>🚌 {t.bus_number}</div>
                  </div>
                  <div>
                    <div style={styles.infoLabel}>Departs</div>
                    <div style={styles.infoValue}>🕒 {new Date(t.departure_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                  </div>
                </div>

                <div style={styles.infoRow}>
                  <div>
                    <div style={styles.infoLabel}>Seats Left</div>
                    <div style={{ ...styles.infoValue, color: t.available_seats > 0 ? '#2E7D32' : '#C62828' }}>
                      💺 {t.available_seats}
                    </div>
                  </div>
                  <div>
                    <div style={styles.infoLabel}>Fare (Single)</div>
                    <div style={styles.infoValue}>💰 ৳ {t.route?.single_trip_fare ?? t.single_trip_fare ?? '-'}</div>
                  </div>
                </div>

                {/* Footer: Status + Book */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
                  {canUpdateStatus ? (
                    <select
                      value={t.status}
                      onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                      style={{
                        ...styles.statusBadge,
                        background: sc.bg,
                        color: sc.color,
                        border: '1px solid ' + sc.color + '44',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <span style={{ ...styles.statusBadge, background: sc.bg, color: sc.color }}>
                      {t.status.replace('_', ' ')}
                    </span>
                  )}

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {canModifyTrip && (
                      <button
                        onClick={() => navigate(`/trips/${t.id}/modify`)}
                        style={styles.modifyBtn}
                      >
                        🛠️ Modify
                      </button>
                    )}

                    {isStudent && (
                      <button
                        onClick={() => bookTrip(t.id)}
                        disabled={!ti.bookable || t.status !== 'scheduled' || t.available_seats <= 0 || !!activeBookingMsg}
                        title={activeBookingMsg || ''}
                        style={{
                          ...styles.bookBtn,
                          opacity: !ti.bookable || t.status !== 'scheduled' || t.available_seats <= 0 || !!activeBookingMsg ? 0.45 : 1,
                          cursor: !ti.bookable || t.status !== 'scheduled' || t.available_seats <= 0 || !!activeBookingMsg ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Book Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
    gap: 16,
    flexWrap: 'wrap',
  },
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  search: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    minWidth: 220,
    fontSize: 14,
  },

  /* ── Toolbar ── */
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 18,
    padding: '10px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
  },
  selectAllLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },
  counter: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--primary-color)',
    marginLeft: 4,
  },
  bulkBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1.5px solid var(--primary-color)',
    background: 'var(--primary-color)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },

  /* ── Dropdown ── */
  dropdown: {
    position: 'absolute',
    top: '110%',
    left: 0,
    minWidth: 220,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 200,
    overflow: 'visible',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    position: 'relative',
    userSelect: 'none',
    borderBottom: '1px solid var(--border-light, #f0f0f0)',
    transition: 'background 0.1s',
  },
  submenu: {
    position: 'absolute',
    top: -4,
    left: '100%',
    minWidth: 180,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 300,
    overflow: 'hidden',
  },
  submenuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },

  /* ── Trip Cards ── */
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 20,
    transition: 'outline 0.15s, box-shadow 0.15s',
    cursor: 'default',
  },
  routeName: { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 },
  routeTags: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  tag: {
    fontSize: 11, background: 'var(--primary-light)', color: 'var(--primary-color)',
    padding: '3px 10px', borderRadius: 999, fontWeight: 600, textTransform: 'capitalize',
  },
  divider: { height: 1, background: 'var(--border-color)', margin: '12px 0' },
  infoRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 },
  infoLabel: {
    fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
  },
  infoValue: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  statusBadge: {
    padding: '6px 12px', borderRadius: 999, fontSize: 12,
    fontWeight: 700, textTransform: 'capitalize',
  },
  bookBtn: {
    background: 'var(--primary-color)', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13,
    boxShadow: '0 4px 12px -4px rgba(108, 99, 255, 0.5)', cursor: 'pointer',
  },
  modifyBtn: {
    background: '#FFF',
    color: '#6C63FF',
    border: '1.5px solid #6C63FF',
    borderRadius: 10,
    padding: '9px 14px',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  ruleNotice: {
    background: '#FFF8E1',
    border: '1px solid #FFE082',
    color: '#5D4037',
    padding: '12px 16px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 16,
  },
  empty: {
    marginTop: 30, background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)', borderRadius: 14,
    padding: 40, textAlign: 'center',
  },
};
