import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useRFIDScanner } from '../hooks/useRFIDScanner';
import { syncService } from '../services/SyncService';
import { useOfflineSync } from '../hooks/useOfflineSync';

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  confirmed:   { bg: '#E8F5E9', color: '#2E7D32', label: 'Confirmed' },
  checked_in:  { bg: '#E3F2FD', color: '#1565C0', label: 'Checked In' },
  cancelled:   { bg: '#FFEBEE', color: '#C62828', label: 'Cancelled' },
  no_show:     { bg: '#FFF3E0', color: '#E65100', label: 'No Show' },
};

export default function ModifyTrip() {
  const { id: tripIdParam } = useParams<{ id: string }>();
  const tripId = Number(tripIdParam);
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{type: 'success' | 'error' | 'warning', text: string} | null>(null);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'rfid_scanned' | 'not_rfid_scanned' | 'checked_in' | 'no_show' | 'cancelled'>('all');
  
  const { isOnline, pendingCount } = useOfflineSync();

  const handleScan = async (rfid: string) => {
    try {
      setScanMessage(null);
      if (!navigator.onLine) {
        throw new Error('OFFLINE_CACHE');
      }

      const res = await api.post('/bookings/rfid/gate-scan', { rfid_id: rfid, trip_id: tripId });
      
      setScanMessage({ type: 'success', text: `Scanned: ${res.data.student?.name} (${res.data.student?.student_id})` });
      loadManifest(); // Refresh the passenger list
    } catch (err: any) {
      if (err.message === 'OFFLINE_CACHE' || err.code === 'ERR_NETWORK' || !err.response) {
        syncService.addScan({ type: 'bus', rfid_id: rfid, trip_id: tripId });
        setScanMessage({ type: 'warning', text: `Device Offline. Scan saved locally and will sync when online.` });
      } else {
        setScanMessage({ type: 'error', text: err.response?.data?.message || err.response?.data?.error || 'Scan Failed' });
      }
    }
    
    // Clear message after 4 seconds
    setTimeout(() => setScanMessage(null), 4000);
  };

  useRFIDScanner(handleScan);

  const canManage = ['super_admin', 'manager', 'developer', 'admin', 'bus_attendant'].some(
    (r) => (window as any).__AUTH_ROLE === r ||
      JSON.parse(localStorage.getItem('auth_user') || '{}').role === r
  );

  const loadManifest = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings/trip/${tripId}/manifest`);
      setManifest(res.data);
    } catch (e: any) {
      console.error(e);
      alert('❌ Failed to load trip manifest: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadManifest(); }, [tripId]);

  const markNoShows = async () => {
    if (!confirm('Manually run the no-show pass now?\n\nThis will mark un-scanned passengers as no-show and deduct full fare.')) return;
    try {
      setActionLoading('no-show');
      const res = await api.post(`/bookings/trip/${tripId}/run-no-show`);
      alert(
        '✅ No-show pass completed.\n\n' +
        (res.data.result?.processed
          ? `${res.data.result.processed} passenger(s) marked as no_show.\n`
          : '') +
        (res.data.result?.skipped
          ? `Skipped: ${res.data.result.skipped}\n`
          : '')
      );
      loadManifest();
    } catch (e: any) {
      alert('❌ Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(null);
    }
  };

  const checkInPassenger = async (bookingId: number, studentName: string) => {
    if (!confirm(`Manually check in ${studentName}?\n\nThis will deduct the full fare from their wallet.`)) return;
    try {
      setActionLoading(`ci:${bookingId}`);
      await api.post(`/bookings/${bookingId}/checkin`);
      loadManifest();
    } catch (e: any) {
      alert('❌ Failed to check-in: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(null);
    }
  };

  const assignStandby = async (bookingId: number, studentName: string) => {
    if (!confirm(`Assign seat to standby passenger ${studentName}?`)) return;
    try {
      setActionLoading(`sb:${bookingId}`);
      await api.post(`/bookings/${bookingId}/assign-seat`);
      loadManifest();
    } catch (e: any) {
      alert('❌ Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(null);
    }
  };

  const cancelPassenger = async (bookingId: number, studentName: string) => {
    if (!confirm(`Manager-cancel booking for ${studentName}?\nThis will issue a full refund (no penalty).`)) return;
    try {
      setActionLoading(`cx:${bookingId}`);
      await api.post(`/bookings/${bookingId}/cancel`);
      loadManifest();
    } catch (e: any) {
      alert('❌ Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="app-page">
        <div className="loading-spinner dark" style={{ marginTop: 40 }} />
        <p style={{ textAlign: 'center', color: '#888', marginTop: 12 }}>Loading trip manifest…</p>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="app-page">
        <Link to="/explore" style={{ color: '#6C63FF', fontWeight: 700 }}>← Back to Trips</Link>
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Trip not found.</div>
      </div>
    );
  }

  const { trip, passengers, stats } = manifest;

  const filtered = passengers.filter((p: any) => {
    switch (filter) {
      case 'confirmed':        return p.status === 'confirmed';
      case 'rfid_scanned':     return p.is_rfid_scanned === true;
      case 'not_rfid_scanned': return p.is_rfid_scanned !== true && p.status !== 'cancelled';
      case 'checked_in':       return p.status === 'checked_in';
      case 'no_show':          return p.status === 'no_show';
      case 'cancelled':        return p.status === 'cancelled';
      default:                 return true;
    }
  });

  return (
    <div className="app-page">
      <div style={styles.header}>
        <div>
          <Link to="/explore" style={{ color: '#6C63FF', fontWeight: 700, textDecoration: 'none' }}>← Back to Trips</Link>
          <h2 style={styles.heading}>🔧 Modify Trip #{tripId}</h2>
          <p style={styles.sub}>
            {trip.route_name} · 🚍 {trip.bus_number} · 🕒 {new Date(trip.departure_time).toLocaleString()}
          </p>
          {!isOnline && (
            <div style={{ marginTop: 8, display: 'inline-block', padding: '4px 8px', background: '#FF9800', color: 'white', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
              📶 OFFLINE - {pendingCount} scans pending sync
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={loadManifest} style={styles.outlineBtn}>🔄 Refresh</button>
          {canManage && (
            <button
              onClick={markNoShows}
              disabled={!manifest.can_mark_no_shows || actionLoading === 'no-show'}
              style={{
                ...styles.primaryBtn,
                background: manifest.can_mark_no_shows ? '#C62828' : '#9E9E9E',
                opacity: manifest.can_mark_no_shows ? 1 : 0.7,
                cursor: manifest.can_mark_no_shows ? 'pointer' : 'not-allowed',
              }}
            >
              {actionLoading === 'no-show' ? '⏳ Running…' :
               manifest.can_mark_no_shows ? '🚫 Mark No-Shows' : '⏳ Too Early (5min grace)'}
            </button>
          )}
        </div>
      </div>

      {scanMessage && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '16px',
          borderRadius: '8px',
          background: scanMessage.type === 'success' ? '#E8F5E9' : scanMessage.type === 'warning' ? '#FFF3E0' : '#FFEBEE',
          color: scanMessage.type === 'success' ? '#2E7D32' : scanMessage.type === 'warning' ? '#E65100' : '#C62828',
          border: `1px solid ${scanMessage.type === 'success' ? '#A5D6A7' : scanMessage.type === 'warning' ? '#FFCC80' : '#EF9A9A'}`,
          fontWeight: 600
        }}>
          {scanMessage.type === 'success' ? '✅ ' : scanMessage.type === 'warning' ? '⚠️ ' : '❌ '}
          {scanMessage.text}
        </div>
      )}

      {/* ── Trip Info + Stats ── */}
      <div style={styles.infoGrid}>
        <InfoCard label="Trip Status" value={trip.status.replace('_', ' ')} color="#6C63FF" capitalize />
        <InfoCard label="Total Bookings" value={stats.total_booked} color="#1976D2" />
        <InfoCard label="Confirmed / Awaiting" value={stats.confirmed} color="#388E3C" />
        <InfoCard label="RFID Scanned" value={stats.rfid_scanned} color={stats.rfid_scanned > 0 ? '#2E7D32' : '#616161'} />
        <InfoCard label="Checked In" value={stats.checked_in} color="#1565C0" />
        <InfoCard label="No Shows" value={stats.no_show} color={stats.no_show > 0 ? '#E65100' : '#616161'} />
        <InfoCard label="Cancelled" value={stats.cancelled} color="#757575" />
        <InfoCard label="Standby Waiting" value={stats.standby_confirmed} color="#EF6C00" />
      </div>

      {trip.no_show_processed && (
        <div style={{ ...styles.notice, background: '#E8F5E9', color: '#2E7D32', borderColor: '#A5D6A7' }}>
          ✅ No-show processing already completed for this trip.
        </div>
      )}
      {manifest.departure_passed && !trip.no_show_processed && (
        <div style={{ ...styles.notice, background: '#FFF8E1', color: '#795548', borderColor: '#FFE082' }}>
          ⏱️ Trip has departed. Passengers who have NOT scanned RFID within {trip.no_show_grace_minutes || 5} minutes
          of departure will automatically be marked <strong>no-show</strong> (full fare deducted).
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div style={styles.filterBar}>
        {(['all','confirmed','rfid_scanned','not_rfid_scanned','checked_in','no_show','cancelled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterChip,
              background: filter === f ? '#6C63FF' : 'transparent',
              color: filter === f ? '#fff' : '#555',
              borderColor: filter === f ? '#6C63FF' : 'var(--border-color)',
              fontWeight: filter === f ? 700 : 600,
            }}
          >
            {f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 13 }}>
          Showing {filtered.length} of {passengers.length}
        </span>
      </div>

      {/* ── Passenger Table ── */}
      {filtered.length === 0 ? (
        <div style={styles.empty}>
          <span style={{ fontSize: 32 }}>🎫</span>
          <p style={{ marginTop: 8, color: '#666' }}>No passengers match the filter.</p>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.theadRow}>
                <th style={styles.th}>SL</th>
                <th style={styles.th}>Student</th>
                <th style={styles.th}>Student ID</th>
                <th style={styles.th}>Dept</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Fare</th>
                <th style={styles.th}>Booking Status</th>
                <th style={styles.th}>RFID Scan</th>
                <th style={styles.th}>Scan Time</th>
                <th style={styles.th}>Cancel Fee</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any, idx: number) => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.confirmed;
                const isScanBusy = actionLoading === `ci:${p.id}`;
                const isAssignBusy = actionLoading === `sb:${p.id}`;
                const isCxBusy = actionLoading === `cx:${p.id}`;
                return (
                  <tr key={p.id} style={{ ...styles.tbodyRow, opacity: p.status === 'cancelled' ? 0.55 : 1 }}>
                    <td style={styles.td}>{idx + 1}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{p.email}</div>
                      {p.rfid_id && <div style={{ fontSize: 11, color: '#6C63FF' }}>RFID: {p.rfid_id}</div>}
                    </td>
                    <td style={styles.td}>{p.student_id || '—'}</td>
                    <td style={styles.td}>{p.department || '—'}</td>
                    <td style={styles.td}>
                      {p.is_standby ? (
                        <span style={{ ...styles.chip, background: '#FFF3E0', color: '#EF6C00' }}>
                          Standby #{p.standby_position}
                        </span>
                      ) : (
                        <span style={{ ...styles.chip, background: '#E8F5E9', color: '#2E7D32' }}>
                          {p.seat_number ? `Seat #${p.seat_number}` : 'Seat'}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>৳ {Number(p.fare_amount || 0).toFixed(2)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.chip, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      {p.penalty_amount > 0 && (
                        <div style={{ fontSize: 11, color: '#E65100', marginTop: 4 }}>
                          No-show penalty ৳ {Number(p.penalty_amount).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      {p.is_rfid_scanned === true ? (
                        <span style={{ ...styles.rfidChip, background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}>
                          ✅ Scanned
                        </span>
                      ) : p.status === 'cancelled' ? (
                        <span style={{ ...styles.rfidChip, background: '#F5F5F5', color: '#999', border: '1px solid #e0e0e0' }}>
                          — N/A —
                        </span>
                      ) : (
                        <span style={{ ...styles.rfidChip, background: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }}>
                          ❌ Not Scanned
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {p.scanned_at
                        ? new Date(p.scanned_at).toLocaleString()
                        : p.checked_in_at
                        ? `Check-in: ${new Date(p.checked_in_at).toLocaleString()}`
                        : '—'}
                    </td>
                    <td style={styles.td}>
                      {p.status === 'cancelled'
                        ? `৳ ${Number(p.cancellation_fee || 0).toFixed(2)}`
                        : '—'}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canManage && p.status === 'confirmed' && (
                          <button
                            onClick={() => checkInPassenger(p.id, p.name)}
                            disabled={isScanBusy}
                            style={{ ...styles.miniBtn, background: '#1565C0', opacity: isScanBusy ? 0.6 : 1 }}
                          >
                            {isScanBusy ? '⏳' : '✓ Check-in'}
                          </button>
                        )}
                        {canManage && p.is_standby && p.status === 'confirmed' && (
                          <button
                            onClick={() => assignStandby(p.id, p.name)}
                            disabled={isAssignBusy}
                            style={{ ...styles.miniBtn, background: '#EF6C00', opacity: isAssignBusy ? 0.6 : 1 }}
                          >
                            {isAssignBusy ? '⏳' : '🎟️ Assign Seat'}
                          </button>
                        )}
                        {canManage && (p.status === 'confirmed') && (
                          <button
                            onClick={() => cancelPassenger(p.id, p.name)}
                            disabled={isCxBusy}
                            style={{ ...styles.miniBtn, background: '#616161', opacity: isCxBusy ? 0.6 : 1 }}
                          >
                            {isCxBusy ? '⏳' : '✕ Cancel (refund)'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, color, capitalize }: { label: string; value: any; color: string; capitalize?: boolean }) {
  const display = typeof value === 'string' && capitalize
    ? value.replace(/\b\w/g, (c) => c.toUpperCase())
    : value;
  return (
    <div style={styles.infoCard}>
      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4 }}>{display}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  heading: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 2px' },
  sub: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  outlineBtn: {
    padding: '10px 16px',
    borderRadius: 10,
    border: '1.5px solid #6C63FF',
    background: 'transparent',
    color: '#6C63FF',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 12px -4px rgba(0,0,0,0.2)',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  notice: {
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid',
    marginBottom: 16,
    fontSize: 13,
    fontWeight: 600,
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    margin: '16px 0 12px',
  },
  filterChip: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
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
    fontSize: 13,
    minWidth: 980,
  },
  theadRow: {
    background: '#F3F1FF',
  },
  th: {
    padding: '12px 14px',
    textAlign: 'left',
    fontWeight: 800,
    fontSize: 11,
    color: '#6C63FF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    whiteSpace: 'nowrap',
  },
  tbodyRow: {
    borderBottom: '1px solid var(--border-light, #f0f0f0)',
  },
  td: {
    padding: '12px 14px',
    verticalAlign: 'top',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  rfidChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    gap: 6,
  },
  miniBtn: {
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px -2px rgba(0,0,0,0.2)',
  },
  empty: {
    marginTop: 20,
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)',
    borderRadius: 14,
    padding: 40,
    textAlign: 'center',
  },
};
