import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Bookings() {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'student';
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings');
      setBookings(res.data.bookings || []);
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

  const cancelBooking = async (booking: any) => {
    const mins = minsUntil(booking.trip?.departure_time || booking.departure_time);
    const freeCancelMins = Number(booking.free_cancel_minutes ?? 60);
    const penalty = Number(booking.emergency_cancel_penalty ?? 50);
    const fare = Number(booking.fare_amount || booking.route?.single_trip_fare || 0);

    let confirmMsg = '';
    if (mins >= freeCancelMins) {
      confirmMsg = `Confirm cancellation?\n\n✓ You are canceling ≥ ${freeCancelMins / 60}h before departure.\n✓ FULL REFUND of ৳ ${fare.toFixed(2)}\n✓ No penalty.`;
    } else if (mins > 0) {
      confirmMsg =
        `⚠️ EMERGENCY cancellation (less than ${freeCancelMins / 60}h before departure)\n\n` +
        `Fare: ৳ ${fare.toFixed(2)}\n` +
        `Emergency cancellation penalty: ৳ ${penalty.toFixed(2)}\n` +
        `Estimated refund: ৳ ${Math.max(0, fare - penalty).toFixed(2)}\n\n` +
        `Do you want to proceed?`;
    } else {
      confirmMsg = 'Trip has already departed. Are you sure you still want to cancel?';
    }

    if (!confirm(confirmMsg)) return;

    try {
      setCancellingId(booking.id);
      const res = await api.post(`/bookings/${booking.id}/cancel`);
      alert(`✅ ${res.data.message}`);
      load();
    } catch (e: any) {
      alert('❌ Failed to cancel: ' + (e.response?.data?.error || e.message));
    } finally {
      setCancellingId(null);
    }
  };

  const isTripDeparted = (b: any) => minsUntil(b.trip?.departure_time || b.departure_time) <= 0;
  const cancelAllowed = (b: any) => {
    if (b.status !== 'confirmed') return false;
    if (b.status === 'no_show') return false;
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
      return `🚫 No Show — ৳ ${Number(b.penalty_amount || b.fare_amount || 0).toFixed(2)} deducted.`;
    }
    if (b.status === 'checked_in') {
      if (b.is_rfid_scanned === true || b.scanned_at) return '✅ RFID was scanned then checked in.';
      return '✅ Checked in (fare deducted).';
    }
    if (b.status !== 'confirmed') return '';

    if (mins <= 0) {
      return 'Trip has departed. Cancelling now will not refund fare.';
    }
    if (mins >= freeCancelMins) {
      const hrs = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return `🟢 ${hrs}h ${m}m left — cancel now for FULL REFUND.`;
    }
    return `🟠 Departure in ${Math.round(mins)} minutes — canceling now charges ৳ ${penalty.toFixed(2)} penalty (max refund ৳ ${Math.max(0, Number(b.fare_amount || 0) - penalty).toFixed(2)}).`;
  };

  return (
    <div className="app-page">
      <h2 style={styles.heading}>🎫 My Bookings</h2>
      <p style={styles.sub}>All your current and past transport bookings</p>

      {isStudent && (
        <div style={styles.rulesBox}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#5D4037' }}>📋 Booking Rules</p>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, color: '#5D4037', fontSize: 12, lineHeight: 1.6 }}>
            <li><strong>1 active booking</strong> per student — cancel first to book another.</li>
            <li>Bookable <strong>3 hours before</strong> departure.</li>
            <li>Cancel FREE if done <strong>≥ 1 hour before</strong> departure.</li>
            <li>Cancel {'< 1h'} → <strong>50 ৳ emergency penalty</strong> (refund the rest).</li>
            <li>No RFID scan within <strong>5 minutes of departure</strong> → <strong>NO SHOW</strong>: full fare kept, counted in your no-show history.</li>
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
                    📅 {b.trip?.departure_time ? new Date(b.trip.departure_time).toLocaleString() : '—'}
                  </div>
                  <div style={styles.meta}>🚌 Bus: {b.bus_number || b.trip?.bus_number || '—'}</div>
                  <div style={styles.meta}>
                    💰 Fare: ৳ {Number(b.fare_amount || b.route?.single_trip_fare || 0).toFixed(2)}
                    {b.penalty_amount > 0 && <span style={{ color: '#E65100' }}> · Penalty: ৳ {Number(b.penalty_amount).toFixed(2)}</span>}
                    {b.cancellation_fee > 0 && <span style={{ color: '#C62828' }}> · Cancel fee: ৳ {Number(b.cancellation_fee).toFixed(2)}</span>}
                  </div>
                  {b.scanned_at ? (
                    <div style={{ ...styles.meta, color: '#2E7D32', fontWeight: 700 }}>
                      🔵 RFID scanned at {new Date(b.scanned_at).toLocaleString()}
                    </div>
                  ) : (b.status === 'confirmed' && !departed) ? (
                    <div style={{ ...styles.meta, color: '#C62828', fontWeight: 600 }}>
                      ⚠️ RFID NOT SCANNED — scan at the bus gate to avoid no-show!
                    </div>
                  ) : null}
                  {b.checked_in_at && <div style={styles.meta}>✅ Checked in at {new Date(b.checked_in_at).toLocaleString()}</div>}

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

                  {isStudent && canCancel && (
                    <button
                      onClick={() => cancelBooking(b)}
                      disabled={cancellingId === b.id}
                      style={{
                        ...styles.cancelBtn,
                        opacity: cancellingId === b.id ? 0.6 : 1,
                      }}
                    >
                      {cancellingId === b.id ? '⏳…' : '✕ Cancel Booking'}
                    </button>
                  )}

                  {canModifyOthers && (
                    <button
                      onClick={() => window.location.href = `#/trips/${b.trip_id}/modify`}
                      style={styles.modifyBtn}
                    >
                      🛠️ Modify Trip
                    </button>
                  )}
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
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
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
