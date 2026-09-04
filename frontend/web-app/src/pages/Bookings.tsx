import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Bookings() {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'student';
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; danger?: boolean; onConfirm?: () => void }>({ open: false, title: '', message: '' });
  const [scanningId, setScanningId] = useState<number | null>(null); // bookingId being scanned
  const [scanResult, setScanResult] = useState<{ bookingId: number; type: 'success' | 'error'; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings');
      const raw: any[] = res.data.bookings || [];
      const STATUS_PRIORITY: Record<string, number> = {
        in_progress: 1,
        scheduled:   2,
        pending:     3,
        completed:   4,
        cancelled:   5,
      };
      const sorted = [...raw].sort((a, b) => {
        const sa = a.trip?.status || a.trip_status || 'completed';
        const sb = b.trip?.status || b.trip_status || 'completed';
        const pa = STATUS_PRIORITY[sa] ?? 99;
        const pb = STATUS_PRIORITY[sb] ?? 99;
        if (pa !== pb) return pa - pb;
        const da = new Date(a.trip?.departure_time || a.departure_time || 0).getTime();
        const db = new Date(b.trip?.departure_time || b.departure_time || 0).getTime();
        return da - db;
      });
      setBookings(sorted);
    } catch (e) {
      console.error('Failed to load bookings', e);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const minsUntil = (dt: string | Date) => {
    if (!dt) return -Infinity;
    return (new Date(dt).getTime() - Date.now()) / 60000;
  };

  const runCancelBooking = async (booking: any) => {
    try {
      setCancellingId(booking.id);
      const res = await api.post(`/bookings/${booking.id}/cancel`);
      alert(res.data.message);
      load();
    } catch (e: any) {
      alert('Failed to cancel: ' + (e.response?.data?.error || e.message));
    } finally {
      setCancellingId(null);
    }
  };

  const cancelBooking = async (booking: any) => {
    const mins = minsUntil(booking.trip?.departure_time || booking.departure_time);
    const freeCancelMins = Number(booking.free_cancel_minutes ?? 60);
    const penalty = Number(booking.emergency_cancel_penalty ?? 50);
    const fare = Number(booking.fare_amount || booking.route?.single_trip_fare || 0);
    const tripStatus = booking.trip?.status || booking.trip_status;
    const isAdminRole = ['super_admin', 'admin', 'manager', 'developer'].includes(user?.role || '');

    let title = '';
    let message = '';
    let danger = false;
    if (mins > 0 && mins >= freeCancelMins) {
      title = 'Confirm Cancellation';
      message = `✓ You are canceling ≥ ${freeCancelMins / 60}h before departure.\n✓ FULL REFUND of ৳ ${fare.toFixed(2)}\n✓ No penalty.`;
    } else if (mins > 0) {
      title = '⚠️ Emergency Cancellation';
      danger = true;
      message = `Less than ${freeCancelMins / 60}h before departure:\n\nFare: ৳ ${fare.toFixed(2)}\nPenalty: ৳ ${penalty.toFixed(2)}\nEstimated refund: ৳ ${Math.max(0, fare - penalty).toFixed(2)}\n\nDo you want to proceed?`;
    } else if (tripStatus === 'in_progress') {
      if (isAdminRole) {
        title = '⚠️ Admin Override — In-Progress Trip';
        danger = true;
        message = `Trip is currently IN PROGRESS (bus on the road).\n\nAdmin cancellation — FULL REFUND of ৳ ${fare.toFixed(2)}.\nSeat will be returned to pool.\n\nDo you want to proceed?`;
      } else {
        title = '⚠️ Emergency Cancellation — Departed';
        danger = true;
        message = `Departure time has passed.\n\nFare: ৳ ${fare.toFixed(2)}\nPenalty: ৳ ${penalty.toFixed(2)}\nEstimated refund: ৳ ${Math.max(0, fare - penalty).toFixed(2)}\n\nCancelling now will release the seat. Proceed?`;
      }
    } else {
      title = '⚠️ Late Cancellation';
      danger = true;
      message = `Departure time has passed.\n\nFare: ৳ ${fare.toFixed(2)}\nPenalty: ৳ ${penalty.toFixed(2)}\nEstimated refund: ৳ ${Math.max(0, fare - penalty).toFixed(2)}\n\nDo you want to proceed?`;
    }

    setConfirmDialog({
      open: true,
      title,
      message,
      danger,
      onConfirm: () => {
        setConfirmDialog(d => ({ ...d, open: false }));
        runCancelBooking(booking);
      },
    });
  };

  const isTripDeparted = (b: any) => minsUntil(b.trip?.departure_time || b.departure_time) <= 0;
  const isAdminRole = ['super_admin', 'manager', 'developer', 'admin'].includes(user?.role || '');
  const cancelAllowed = (b: any) => {
    if (b.status !== 'confirmed') return false;
    if (b.is_rfid_scanned === true) return false;
    const tripStatus = b.trip?.status || b.trip_status;
    if (tripStatus === 'completed' || tripStatus === 'cancelled') return false;
    if (tripStatus === 'in_progress' && !isAdminRole) return false;
    return true;
  };

  const canModifyOthers = !isStudent;

  const tripSummaryLine = (b: any) => {
    const mins = minsUntil(b.trip?.departure_time || b.departure_time);
    const freeCancelMins = Number(b.free_cancel_minutes ?? 60);
    const penalty = Number(b.emergency_cancel_penalty ?? 50);

    if (b.status === 'cancelled') {
      return b.cancellation_fee > 0
        ? `Cancelled — emergency fee ৳ ${Number(b.cancellation_fee).toFixed(2)}. Refund ৳ ${(Number(b.fare_amount || 0) - Number(b.cancellation_fee || 0)).toFixed(2)}`
        : b.cancellation_reason === 'no_show' ? '' : 'Cancelled — full refund issued';
    }
    if (b.status === 'no_show') {
      return `No Show — ৳ ${Number(b.penalty_amount || b.fare_amount || 0).toFixed(2)} deducted.`;
    }
    if (b.status === 'checked_in') {
      if (b.is_rfid_scanned === true || b.scanned_at) return 'RFID was scanned then checked in.';
      return 'Checked in (fare deducted).';
    }
    if (b.status !== 'confirmed') return '';

    const tripStatus = b.trip?.status || b.trip_status;
    if (tripStatus === 'in_progress' || tripStatus === 'completed') return '';
    if (mins >= freeCancelMins) {
      const hrs = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return `${hrs}h ${m}m left — cancel now for FULL REFUND.`;
    }
    return `Departure in ${Math.round(mins)} minutes — canceling now charges ৳ ${penalty.toFixed(2)} penalty (max refund ৳ ${Math.max(0, Number(b.fare_amount || 0) - penalty).toFixed(2)}).`;
  };

  return (
    <div className="app-page">
      <h2 style={styles.heading}>🎫 My Bookings</h2>
      <p style={styles.sub}>All your current and past transport bookings</p>

      {isStudent && (
        <div style={styles.rulesBox}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#5D4037' }}>📋 Booking Rules</p>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, color: '#5D4037', fontSize: 12, lineHeight: 1.6 }}>
            <li>Bookable <strong>3 hours before</strong> departure.</li>
            <li>Cancel FREE if done <strong>≥ 1 hour before</strong> departure.</li>
          </ul>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 20 }} />
      ) : bookings.length === 0 ? (
        <div style={styles.empty}>
          <span style={{ fontSize: 36 }}>🎟️</span>
          <p style={{ marginTop: 10, color: '#666', fontWeight: 600 }}>No bookings yet</p>
          <p style={{ marginTop: 4, color: '#888', fontSize: 14 }}>
            Head over to <Link to="/explore" style={{ color: '#6C63FF', fontWeight: 700 }}>Explore Trips</Link> to find and book a bus.
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {bookings.map((b) => {
            const departed = isTripDeparted(b);
            const canCancel = cancelAllowed(b);
            return (
              <div key={b.id} style={{ ...styles.card, opacity: b.status === 'cancelled' ? 0.7 : 1 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={styles.title}>
                    {b.route?.name || b.route_name || `Trip #${b.trip_id}`}
                    {b.seat_number !== null && b.seat_number !== undefined && !b.is_standby && (
                      <span style={styles.seatTag}>Seat #{b.seat_number}</span>
                    )}
                    {b.is_standby && <span style={{ ...styles.seatTag, background: '#FFF3E0', color: '#E65100' }}>
                      Standby #{b.standby_position || '?'}
                    </span>}
                  </div>
                  <div style={styles.meta}>
                    {b.trip?.departure_time ? new Date(b.trip.departure_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                  </div>
                  <div style={styles.meta}>Bus: {b.bus_number || b.trip?.bus_number || '—'}</div>
                  <div style={styles.meta}>
                    Fare: ৳ {Number(b.fare_amount || b.route?.single_trip_fare || 0).toFixed(2)}
                    {b.penalty_amount > 0 && <span style={{ color: '#E65100' }}> · Penalty: ৳ {Number(b.penalty_amount).toFixed(2)}</span>}
                    {b.cancellation_fee > 0 && <span style={{ color: '#C62828' }}> · Cancel fee: ৳ {Number(b.cancellation_fee).toFixed(2)}</span>}
                  </div>
                  {b.scanned_at ? (
                    <div style={{ ...styles.meta, color: '#2E7D32', fontWeight: 700 }}>
                      ✅ Boarded at {new Date(b.scanned_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  ) : (b.status === 'confirmed' && (b.trip?.status === 'in_progress' || b.trip_status === 'in_progress')) ? (
                    <div style={{ ...styles.meta, color: '#C62828', fontWeight: 600 }}>
                      ⚠️ Not boarded yet — tap "Simulate Board" to check in!
                    </div>
                  ) : (b.status === 'confirmed' && !departed) ? (
                    <div style={{ ...styles.meta, color: '#888', fontWeight: 500 }}>
                      🪪 Show ID card at bus gate when boarding
                    </div>
                  ) : null}
                  {b.checked_in_at && <div style={styles.meta}>Checked in at {new Date(b.checked_in_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>}

                  {tripSummaryLine(b) && (
                    <div style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      background:
                        b.status === 'no_show' ? '#FFF3E0' :
                        b.status === 'cancelled' ? '#F5F5F5' :
                        minsUntil(b.trip?.departure_time || b.departure_time) >= Number(b.free_cancel_minutes ?? 60) ? '#E8F5E9' :
                        '#FFF8E1',
                      color:
                        b.status === 'no_show' ? '#E65100' :
                        b.status === 'cancelled' ? '#616161' :
                        minsUntil(b.trip?.departure_time || b.departure_time) >= Number(b.free_cancel_minutes ?? 60) ? '#2E7D32' :
                        '#5D4037',
                    }}>
                      {tripSummaryLine(b)}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <span
                    style={{
                      ...styles.badge,
                      background:
                        b.status === 'confirmed'
                          ? '#E8F5E9'
                          : b.status === 'checked_in'
                          ? '#E3F2FD'
                          : b.status === 'cancelled'
                          ? '#FFEBEE'
                          : b.status === 'no_show'
                          ? '#FFF3E0'
                          : '#F5F5F5',
                      color:
                        b.status === 'confirmed'
                          ? '#2E7D32'
                          : b.status === 'checked_in'
                          ? '#1565C0'
                          : b.status === 'cancelled'
                          ? '#C62828'
                          : b.status === 'no_show'
                          ? '#E65100'
                          : '#666',
                    }}
                  >
                    {b.status.replace('_', ' ')}
                  </span>

                  {(b.trip?.status === 'in_progress' || b.trip_status === 'in_progress') && (
                    <button
                      onClick={() => navigate(`/trip/${b.trip_id}/track`)}
                      style={styles.trackBtn}
                    >
                      Track Trip
                    </button>
                  )}

                  {isStudent && b.status === 'confirmed' && (b.trip?.status === 'scheduled' || b.trip_status === 'scheduled') && !b.scanned_at && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <button
                        onClick={() => handleSelfScan(b.trip_id, b.id)}
                        disabled={scanningId === b.id}
                        style={{
                          ...styles.simulateBtn,
                          opacity: scanningId === b.id ? 0.7 : 1,
                          background: 'linear-gradient(135deg, #6C63FF 0%, #8B83FF 100%)',
                          color: '#fff',
                          border: 'none',
                          boxShadow: '0 4px 12px -4px rgba(108,99,255,0.5)',
                        }}
                      >
                        {scanningId === b.id ? '⏳ Scanning…' : '📡 SCAN'}
                      </button>
                      {scanResult?.bookingId === b.id && (() => {
                        const r = scanResult!;
                        return (
                          <div style={{
                            fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
                            background: r.type === 'success' ? '#E8F5E9' : '#FFEBEE',
                            color: r.type === 'success' ? '#2E7D32' : '#C62828',
                          }}>
                            {r.message}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {b.status === 'cancelled' && (
                    <button
                      onClick={() => navigate('/explore', {
                        state: {
                          preselectRouteId: b.route_id || b.trip?.route_id,
                          preselectTripId: b.trip_id,
                        },
                      })}
                      style={styles.rebookBtn}
                    >
                      Book Again
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => cancelBooking(b)}
                      disabled={cancellingId === b.id}
                      style={{
                        ...styles.cancelBtn,
                        opacity: cancellingId === b.id ? 0.6 : 1,
                      }}
                    >
                      {cancellingId === b.id ? '…' : 'Cancel Booking'}
                    </button>
                  )}

                  {canModifyOthers && (
                    <button
                      onClick={() => window.location.href = `#/trips/${b.trip_id}/modify`}
                      style={styles.modifyBtn}
                    >
                      Modify Trip
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Custom Confirm Dialog (small popup) ── */}
      {confirmDialog.open && (
        <div style={confirmOverlay}>
          <div style={{
            ...confirmBox,
            border: `2px solid ${confirmDialog.danger ? '#EF5350' : '#6C63FF'}`,
          }}>
            <h3 style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: -0.2,
              color: confirmDialog.danger ? '#C62828' : 'var(--text-primary)',
            }}>{confirmDialog.title}</h3>
            <p style={{
              margin: '8px 0 16px 0',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              whiteSpace: 'pre-line',
              fontWeight: 500,
            }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                style={cancelBtn}
                onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
              >Cancel</button>
              <button
                style={{
                  ...okBtn,
                  background: confirmDialog.danger ? '#EF5350' : '#6C63FF',
                }}
                onClick={() => confirmDialog.onConfirm?.()}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function handleSelfScan(tripId: number, bookingId: number) {
    setScanningId(bookingId);
    setScanResult(null);
    try {
      const res = await api.post('/bookings/self-scan', { trip_id: tripId });
      setScanResult({ bookingId, type: 'success', message: res.data.message || 'Boarded!' });
      setTimeout(() => load(), 2000);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Scan failed.';
      setScanResult({ bookingId, type: 'error', message: msg });
    } finally {
      setScanningId(null);
    }
  }
}

const confirmOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.42)',
  display: 'grid', placeItems: 'center',
  zIndex: 9999,
  padding: 20,
};
const confirmBox: React.CSSProperties = {
  width: 'min(420px, 100%)',
  background: 'var(--bg-card)',
  borderRadius: 12,
  padding: '18px 18px 14px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
};
const cancelBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontWeight: 800, fontSize: 12,
  cursor: 'pointer',
};
const okBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  color: '#fff',
  fontWeight: 800, fontSize: 12,
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(108,99,255,0.3)',
};

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  simulateBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1.5px solid #6C63FF',
    background: 'linear-gradient(135deg, #f0eeff 0%, #e8e4ff 100%)',
    color: '#6C63FF',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 16 },
  rulesBox: {
    background: '#FFF8E1',
    border: '1px solid #FFE082',
    borderRadius: 12,
    padding: '12px 16px',
    marginBottom: 20,
  },
  list: { display: 'grid', gap: 12 },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 18,
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 6,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  seatTag: {
    fontSize: 11,
    background: 'var(--primary-light)',
    color: 'var(--primary-color)',
    padding: '3px 8px',
    borderRadius: 999,
    fontWeight: 700,
  },
  meta: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginTop: 2,
  },
  badge: {
    padding: '7px 14px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  cancelBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1.5px solid #C62828',
    background: '#fff',
    color: '#C62828',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  modifyBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1.5px solid #6C63FF',
    background: '#fff',
    color: '#6C63FF',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  trackBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, var(--primary-color) 0%, #8B83FF 100%)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    boxShadow: '0 4px 12px -4px rgba(108, 99, 255, 0.45)',
  },
  rebookBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1.5px solid #2E7D32',
    background: '#fff',
    color: '#2E7D32',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  empty: {
    marginTop: 30,
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)',
    borderRadius: 14,
    padding: 50,
    textAlign: 'center',
    color: 'var(--text-secondary)',
  },
};
