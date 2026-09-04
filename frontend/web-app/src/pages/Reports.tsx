import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

interface BookingDay {
  day: string;
  total: number;
  fulfilled: number;
  no_show: number;
  cancelled: number;
  revenue_bdt: number;
}
interface TripDay {
  day: string;
  total: number;
  completed: number;
  in_progress: number;
  cancelled: number;
  delayed: number;
  scheduled: number;
}
interface RouteRow {
  route_id: number;
  route_name: string;
  direction: string;
  classification: string;
  trip_count: number;
  booking_count: number;
  fulfilled: number;
  no_show: number;
  cancelled: number;
  revenue_bdt: number;
  avg_bookings_per_trip: number;
  no_show_rate_pct: number;
  cancellation_rate_pct: number;
  fulfilment_rate_pct: number;
}
interface ParkingDaily {
  day: string;
  entries: number;
  exits: number;
  revenue_bdt: number;
  avg_duration_min: number;
}
interface ParkingPeak {
  hour_of_day: number;
  hour_label: string;
  entries: number;
}
interface Parking {
  capacity: {
    total_spots: number;
    total_occupied: number;
    total_available: number;
    occupancy_pct: number;
    car: { total: number; occupied: number; available: number; occupancy_pct: number };
    bike: { total: number; occupied: number; available: number; occupancy_pct: number };
  };
  daily: ParkingDaily[];
  last_30_days: {
    total_sessions: number;
    revenue_bdt: number;
    avg_sessions_per_day: number;
  };
  breakdown_by_vehicle: { category: string; sessions: number; revenue_bdt: number }[];
  peak_hours: ParkingPeak[];
}
interface TripRevenueRow {
  trip_id: number;
  route_name: string;
  direction: string;
  bus_number: string;
  departure_time: string;
  status: string;
  unique_users: number;
  total_bookings: number;
  fulfilled: number;
  no_show: number;
  cancelled: number;
  fare_revenue_bdt: number;
  penalty_revenue_bdt: number;
  cancellation_revenue_bdt: number;
  total_revenue_bdt: number;
}
interface ParkingRevenueRow {
  vehicle_category: string;
  user_id: number;
  user_name: string;
  total_sessions: number;
  completed_sessions: number;
  active_sessions: number;
  revenue_bdt: number;
  avg_duration_min: number;
  first_seen_at: string;
  last_seen_at: string;
}
interface ParkingRevenueTotals {
  total_sessions: number;
  completed: number;
  unique_vehicles: number;
  unique_registered_users: number;
  total_revenue_bdt: number;
}
interface ParkingRevenue {
  rows: ParkingRevenueRow[];
  totals: ParkingRevenueTotals;
}
interface Summary {
  total_bookings: number;
  fulfilled_bookings: number;
  no_show_bookings: number;
  cancelled_bookings: number;
  no_show_rate_pct: number;
  fulfilment_rate_pct: number;
  cancellation_rate_pct: number;
  total_trips: number;
  completed_trips: number;
  active_trips: number;
  booking_revenue_bdt: number;
  parking_revenue_bdt: number;
  total_revenue_bdt: number;
  parking_active_sessions: number;
  parking_occupancy_pct: number;
  parking_capacity: {
    car_total: number; car_occupied: number; car_available: number;
    bike_total: number; bike_occupied: number; bike_available: number;
  };
}

export default function Reports() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bookingTrend, setBookingTrend] = useState<BookingDay[]>([]);
  const [tripTrend, setTripTrend] = useState<TripDay[]>([]);
  const [perRoute, setPerRoute] = useState<RouteRow[]>([]);
  const [parking, setParking] = useState<Parking | null>(null);
  const [tripRevenue, setTripRevenue] = useState<TripRevenueRow[]>([]);
  const [parkingRevenue, setParkingRevenue] = useState<ParkingRevenue | null>(null);
  const [bullets, setBullets] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: keyof RouteRow; dir: 'asc' | 'desc' }>({
    key: 'booking_count', dir: 'desc',
  });
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const isAllowed = ['super_admin', 'admin', 'manager', 'developer'].includes(user?.role || '');

  useEffect(() => {
    if (!isAllowed) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/analytics/dashboard');
        if (!alive) return;
        setSummary(res.data.summary);
        setBookingTrend(res.data.booking_trend || []);
        setTripTrend(res.data.trip_trend || []);
        setPerRoute(res.data.per_route || []);
        setParking(res.data.parking);
        setTripRevenue(res.data.trip_revenue || []);
        setParkingRevenue(res.data.parking_revenue || { rows: [], totals: { total_sessions: 0, completed: 0, unique_vehicles: 0, unique_registered_users: 0, total_revenue_bdt: 0 } });
        setBullets(res.data.summary_bullets || []);
        setGeneratedAt(res.data.generated_at);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || 'Failed to load reports');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isAllowed]);

  if (!isAllowed) {
    return (
      <div style={forbiddenStyles.wrap}>
        <div style={forbiddenStyles.card}>
          <div style={forbiddenStyles.icon}>🚫</div>
          <div style={forbiddenStyles.title}>⚠️ Forbidden: Insufficient permissions</div>
          <div style={forbiddenStyles.subtitle}>You do not have the required privileges to access the Reports &amp; Analytics page. Please contact an administrator if you believe this is an error.</div>
        </div>
      </div>
    );
  }

  const sortedRoutes = useMemo(() => {
    const arr = [...perRoute];
    arr.sort((a, b) => {
      const va = (a as any)[sort.key];
      const vb = (b as any)[sort.key];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sort.dir === 'asc' ? va - vb : vb - va;
      }
      return sort.dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [perRoute, sort]);

  const bookingTotalMax = useMemo(
    () => Math.max(1, ...bookingTrend.map(d => d.total || 0)),
    [bookingTrend]
  );
  const tripTotalMax = useMemo(
    () => Math.max(1, ...tripTrend.map(d => d.total || 0)),
    [tripTrend]
  );
  const parkingEntriesMax = useMemo(
    () => Math.max(1, ...(parking?.daily || []).map(d => d.entries || 0)),
    [parking]
  );
  const peakMax = useMemo(
    () => Math.max(1, ...(parking?.peak_hours || []).map(p => p.entries || 0)),
    [parking]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>📊 Analytics &amp; Reports</h1>
          <p style={styles.pageSubtitle}>
            Booking trends, parking usage frequency, and no-show rates per route.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={styles.metaChip}>
            {loading ? (
              <><span className="loading-spinner dark" style={{ width: 12, height: 12, borderWidth: 2 }} /> Loading report…</>
            ) : generatedAt ? (
              `Generated ${new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}`
            ) : ''}
          </span>
          <button
            style={styles.refreshBtn}
            onClick={() => window.location.reload()}
            title="Refresh report"
          >🔄 Refresh</button>
        </div>
      </header>

      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI summary cards */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Executive Summary</h2>
        <div style={styles.kpiGrid}>
          <KpiCard icon="🎫" label="Total Bookings" value={fmtInt(summary?.total_bookings)} sub={`Fulfilled ${fmtInt(summary?.fulfilled_bookings)}`} />
          <KpiCard icon="🚌" label="Total Trips" value={fmtInt(summary?.total_trips)} sub={`Completed ${fmtInt(summary?.completed_trips)} · Active ${fmtInt(summary?.active_trips)}`} />
          <KpiCard
            icon="💸"
            label="Total Revenue"
            value={`${fmtInt(summary?.total_revenue_bdt)} ৳`}
            sub={`Fares ${fmtInt(summary?.booking_revenue_bdt)} ৳ · Parking ${fmtInt(summary?.parking_revenue_bdt)} ৳`}
            tone="revenue"
          />
          <KpiCard
            icon="👻"
            label="No-Show Rate"
            value={`${fmtPct(summary?.no_show_rate_pct)}%`}
            sub={`${fmtInt(summary?.no_show_bookings)} bookings`}
            tone={(summary?.no_show_rate_pct ?? 0) > 15 ? 'bad' : 'good'}
          />
          <KpiCard
            icon="✅"
            label="Fulfilment"
            value={`${fmtPct(summary?.fulfilment_rate_pct)}%`}
            sub={`Cancellation ${fmtPct(summary?.cancellation_rate_pct)}%`}
            tone="good"
          />
          <KpiCard
            icon="🏛️"
            label="Parking Occupancy"
            value={`${fmtPct(summary?.parking_occupancy_pct)}%`}
            sub={`Active sessions ${fmtInt(summary?.parking_active_sessions)}`}
            tone={(summary?.parking_occupancy_pct ?? 0) > 85 ? 'bad' : 'good'}
          />
        </div>

        {bullets?.length > 0 && (
          <div style={styles.bulletBox}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>📝 Auto-Generated Report Summary</h3>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Booking trend */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <h2 style={styles.sectionTitle}>🎫 Booking Trend (last 14 days)</h2>
          <Legend items={[
            { color: '#6C63FF', label: 'Fulfilled' },
            { color: '#F44336', label: 'No-show' },
            { color: '#B0BEC5', label: 'Cancelled' },
          ]} />
        </div>
        <div style={styles.chartCard}>
          {bookingTrend.length === 0 ? (
            <EmptyState label="No booking data yet" />
          ) : (
            <>
              <div style={styles.barChart}>
                {bookingTrend.map(d => {
                  const fullH = (d.fulfilled / bookingTotalMax) * 100;
                  const noH = (d.no_show / bookingTotalMax) * 100;
                  const canH = (d.cancelled / bookingTotalMax) * 100;
                  return (
                    <div key={d.day} style={styles.barColumn} title={`${d.day}: total ${d.total}, revenue ${d.revenue_bdt}৳`}>
                      <div style={styles.barStack}>
                        <div style={{ ...styles.bar, height: `${fullH}%`, background: '#6C63FF' }} />
                        <div style={{ ...styles.bar, height: `${noH}%`, background: '#F44336' }} />
                        <div style={{ ...styles.bar, height: `${canH}%`, background: '#B0BEC5' }} />
                      </div>
                      <div style={styles.barLabel}>
                        {shortDate(d.day)}
                      </div>
                      <div style={styles.barTotals}>{d.total}</div>
                    </div>
                  );
                })}
              </div>
              <MiniMetricRow>
                <MiniMetric label="Total bookings (14d)" value={fmtInt(bookingTrend.reduce((a, d) => a + d.total, 0))} />
                <MiniMetric label="Total revenue (14d)" value={`${fmtInt(bookingTrend.reduce((a, d) => a + d.revenue_bdt, 0))} ৳`} />
                <MiniMetric label="Avg bookings / day" value={fmtPct(bookingTrend.reduce((a, d) => a + d.total, 0) / Math.max(1, bookingTrend.length))} />
              </MiniMetricRow>
            </>
          )}
        </div>
      </section>

      {/* Trip trend */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <h2 style={styles.sectionTitle}>🚌 Trip Status Trend (last 14 days)</h2>
          <Legend items={[
            { color: '#66BB6A', label: 'Completed' },
            { color: '#29B6F6', label: 'In progress' },
            { color: '#FFA726', label: 'Delayed' },
            { color: '#EF5350', label: 'Cancelled' },
          ]} />
        </div>
        <div style={styles.chartCard}>
          {tripTrend.length === 0 ? (
            <EmptyState label="No trip data yet" />
          ) : (
            <>
              <svg viewBox={`0 0 ${tripTrend.length * 60} 220`} style={{ width: '100%', height: 220 }} preserveAspectRatio="none">
                {[0, 25, 50, 75, 100].map(pct => (
                  <line key={pct} x1="0" x2="100%" y1={200 - (pct / 100) * 180} y2={200 - (pct / 100) * 180}
                    stroke="var(--border-color)" strokeDasharray="2 4" strokeWidth="1" />
                ))}
                <TripLine color="#66BB6A" data={tripTrend} keyField="completed" max={tripTotalMax} />
                <TripLine color="#29B6F6" data={tripTrend} keyField="in_progress" max={tripTotalMax} />
                <TripLine color="#FFA726" data={tripTrend} keyField="delayed" max={tripTotalMax} dashed />
                <TripLine color="#EF5350" data={tripTrend} keyField="cancelled" max={tripTotalMax} dashed />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                {tripTrend.filter((_, i) => i === 0 || i === tripTrend.length - 1 || i % 3 === 0).map(d => (
                  <span key={d.day}>{shortDate(d.day)}</span>
                ))}
              </div>
              <MiniMetricRow>
                <MiniMetric label="Trips completed (14d)" value={fmtInt(tripTrend.reduce((a, d) => a + d.completed, 0))} />
                <MiniMetric label="Trips delayed (14d)" value={fmtInt(tripTrend.reduce((a, d) => a + d.delayed, 0))} />
                <MiniMetric label="Trips cancelled (14d)" value={fmtInt(tripTrend.reduce((a, d) => a + d.cancelled, 0))} />
              </MiniMetricRow>
            </>
          )}
        </div>
      </section>

      {/* Per-route breakdown */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🛣️ Per-Route Performance (No-show / Parking usage / Fulfilment)</h2>
        <div style={styles.chartCard}>
          {sortedRoutes.length === 0 ? (
            <EmptyState label="No route data yet" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      { k: 'route_name', label: 'Route' },
                      { k: 'direction', label: 'Dir' },
                      { k: 'trip_count', label: 'Trips' },
                      { k: 'booking_count', label: 'Bookings' },
                      { k: 'avg_bookings_per_trip', label: 'Avg/Trip' },
                      { k: 'fulfilment_rate_pct', label: 'Fulfill %' },
                      { k: 'no_show_rate_pct', label: 'No-show %' },
                      { k: 'cancellation_rate_pct', label: 'Cancel %' },
                      { k: 'revenue_bdt', label: 'Revenue ৳' },
                    ].map(c => (
                      <th key={c.k} onClick={() => setSort({ key: c.k as any, dir: sort.key === c.k && sort.dir === 'desc' ? 'asc' : 'desc' })}
                        style={{ cursor: 'pointer', userSelect: 'none', ...styles.th }}>
                        {c.label} <span style={{ opacity: 0.6 }}>{sort.key === c.k ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRoutes.map(r => (
                    <tr key={r.route_id} style={styles.tr}>
                      <td style={styles.td}>{r.route_name || `#${r.route_id}`}</td>
                      <td style={{ ...styles.td, textTransform: 'capitalize' }}>{r.direction}</td>
                      <td style={styles.tdR}>{fmtInt(r.trip_count)}</td>
                      <td style={styles.tdR}>{fmtInt(r.booking_count)}</td>
                      <td style={styles.tdR}>{fmtPct(r.avg_bookings_per_trip)}</td>
                      <td style={styles.tdR}><Pill v={r.fulfilment_rate_pct} good={r.fulfilment_rate_pct >= 70} /></td>
                      <td style={styles.tdR}><Pill v={r.no_show_rate_pct} bad={r.no_show_rate_pct > 15} /></td>
                      <td style={styles.tdR}><Pill v={r.cancellation_rate_pct} bad={r.cancellation_rate_pct > 20} /></td>
                      <td style={{ ...styles.tdR, fontWeight: 800 }}>{fmtInt(r.revenue_bdt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Parking report */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <h2 style={styles.sectionTitle}>🏛️ Parking Usage Frequency</h2>
          {parking?.capacity && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={styles.metaChip}>🚗 Car {parking.capacity.car.occupied}/{parking.capacity.car.total} · {fmtPct(parking.capacity.car.occupancy_pct)}%</span>
              <span style={styles.metaChip}>🚲 Bike {parking.capacity.bike.occupied}/{parking.capacity.bike.total} · {fmtPct(parking.capacity.bike.occupancy_pct)}%</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div style={styles.chartCard}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>Daily Entries (14d)</h3>
            {(parking?.daily?.length ?? 0) === 0 ? (
              <EmptyState label="No parking sessions yet" />
            ) : (
              <>
                <div style={{ ...styles.barChart, height: 180 }}>
                  {parking?.daily.map(d => {
                    const h = (d.entries / parkingEntriesMax) * 100;
                    return (
                      <div key={d.day} style={styles.barColumn} title={`${d.day}: ${d.entries} entries, ${d.exits} exits, ${d.revenue_bdt}৳`}>
                        <div style={styles.barStack}>
                          <div style={{ ...styles.bar, height: `${h}%`, background: '#26A69A' }} />
                        </div>
                        <div style={styles.barLabel}>{shortDate(d.day)}</div>
                      </div>
                    );
                  })}
                </div>
                <MiniMetricRow>
                  <MiniMetric label="30d Sessions" value={fmtInt(parking?.last_30_days.total_sessions)} />
                  <MiniMetric label="30d Revenue" value={`${fmtInt(parking?.last_30_days.revenue_bdt)} ৳`} />
                  <MiniMetric label="Avg/Day" value={fmtPct(parking?.last_30_days.avg_sessions_per_day)} />
                </MiniMetricRow>
              </>
            )}
          </div>

          <div style={styles.chartCard}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>Peak Entry Hours (Top 5)</h3>
            {(parking?.peak_hours?.length ?? 0) === 0 ? (
              <EmptyState label="Not enough data for peak hours yet" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {parking?.peak_hours.map(p => {
                  const w = (p.entries / peakMax) * 100;
                  return (
                    <div key={p.hour_of_day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 60, fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' }}>{p.hour_label}</span>
                      <div style={{ flex: 1, height: 22, background: 'var(--bg-hover)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${w}%`, height: '100%', background: '#FF8F00', borderRadius: 6, transition: 'width .4s ease' }} />
                      </div>
                      <span style={{ width: 50, textAlign: 'right', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{p.entries}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <h3 style={{ margin: '18px 0 8px 0', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Vehicle Breakdown (30d)</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {parking?.breakdown_by_vehicle.length ? parking.breakdown_by_vehicle.map(b => (
                <div key={b.category} style={styles.vehicleBox}>
                  <div style={{ fontSize: 22 }}>{b.category === 'car' ? '🚗' : '🚲'}</div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 14 }}>{fmtInt(b.sessions)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtInt(b.revenue_bdt)} ৳</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{b.category}</div>
                </div>
              )) : <EmptyState label="" small />}
            </div>
          </div>
        </div>
      </section>

      {/* Trip-level revenue table */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.sectionTitle}>🚌 Trip Revenue Report — Per Trip</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              Each row is one recorded trip. Unique users = distinct students on the trip; Total Income = fares + penalties + cancellation fees.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={styles.metaChip}>
              Trips: {fmtInt(tripRevenue.length)}
            </span>
            <span style={styles.metaChip}>
              Fares: {fmtInt(tripRevenue.reduce((a, t) => a + t.fare_revenue_bdt, 0))} ৳
            </span>
            <span style={styles.metaChip}>
              Total Income: {fmtInt(tripRevenue.reduce((a, t) => a + t.total_revenue_bdt, 0))} ৳
            </span>
          </div>
        </div>
        <div style={styles.chartCard}>
          {tripRevenue.length === 0 ? (
            <EmptyState label="No trip data recorded yet. Complete trips appear here with their earned revenue." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      { k: 'trip_id', label: 'Trip ID' },
                      { k: 'route_name', label: 'Route' },
                      { k: 'direction', label: 'Dir' },
                      { k: 'bus_number', label: 'Bus' },
                      { k: 'departure_time', label: 'Departure' },
                      { k: 'status', label: 'Status' },
                      { k: 'unique_users', label: 'Users' },
                      { k: 'total_bookings', label: 'Seats' },
                      { k: 'fare_revenue_bdt', label: 'Fares ৳' },
                      { k: 'penalty_revenue_bdt', label: 'Penalties ৳' },
                      { k: 'cancellation_revenue_bdt', label: 'Cancel Fees ৳' },
                      { k: 'total_revenue_bdt', label: 'TOTAL ৳' },
                    ].map(c => (
                      <th key={c.k} style={{
                        textAlign: ['trip_id','direction','status'].includes(c.k) ? 'left' : (['route_name','bus_number','departure_time'].includes(c.k) ? 'left' : 'right'),
                        ...styles.th,
                      }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tripRevenue.map(t => (
                    <tr key={t.trip_id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: 800, color: 'var(--primary-color)' }}>#{t.trip_id}</td>
                      <td style={styles.td}>{t.route_name || `#${t.trip_id}`}</td>
                      <td style={{ ...styles.td, textTransform: 'capitalize' }}>{t.direction}</td>
                      <td style={styles.td}>{t.bus_number}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{t.departure_time ? new Date(t.departure_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</td>
                      <td style={styles.td}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background:
                            t.status === 'completed' ? 'var(--success-bg)' :
                              t.status === 'in_progress' ? 'var(--info-bg)' :
                                t.status === 'cancelled' ? 'var(--danger-bg)' :
                                  t.status === 'delayed' ? 'var(--warning-bg)' :
                                    'var(--bg-hover)',
                          color:
                            t.status === 'completed' ? 'var(--success-text)' :
                              t.status === 'in_progress' ? 'var(--info-text)' :
                                t.status === 'cancelled' ? 'var(--danger-color)' :
                                  t.status === 'delayed' ? 'var(--warning-text)' :
                                    'var(--text-secondary)',
                        }}>{t.status}</span>
                      </td>
                      <td style={styles.tdR}>{fmtInt(t.unique_users)}</td>
                      <td style={styles.tdR}>{fmtInt(t.total_bookings)}</td>
                      <td style={styles.tdR}>{fmtInt(t.fare_revenue_bdt)}</td>
                      <td style={{
                        ...styles.tdR,
                        color: t.penalty_revenue_bdt > 0 ? 'var(--warning-text)' : undefined,
                      }}>{fmtInt(t.penalty_revenue_bdt)}</td>
                      <td style={{
                        ...styles.tdR,
                        color: t.cancellation_revenue_bdt > 0 ? 'var(--danger-color)' : undefined,
                      }}>{fmtInt(t.cancellation_revenue_bdt)}</td>
                      <td style={{
                        ...styles.tdR,
                        fontWeight: 900,
                        color: 'var(--primary-color)',
                        fontSize: 13,
                      }}>{fmtInt(t.total_revenue_bdt)} ৳</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ ...styles.tr, background: 'var(--bg-hover)', fontWeight: 900 }}>
                    <td colSpan={9} style={{ ...styles.tdR, color: 'var(--text-secondary)' }}>
                      GRAND TOTAL ({tripRevenue.length} trips)
                    </td>
                    <td style={{ ...styles.tdR, color: 'var(--warning-text)' }}>
                      {fmtInt(tripRevenue.reduce((a, t) => a + t.penalty_revenue_bdt, 0))}
                    </td>
                    <td style={{ ...styles.tdR, color: 'var(--danger-color)' }}>
                      {fmtInt(tripRevenue.reduce((a, t) => a + t.cancellation_revenue_bdt, 0))}
                    </td>
                    <td style={{ ...styles.tdR, color: 'var(--primary-color)', fontSize: 14 }}>
                      {fmtInt(tripRevenue.reduce((a, t) => a + t.total_revenue_bdt, 0))} ৳
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Parking revenue per user / vehicle table */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.sectionTitle}>🏛️ Parking Revenue Report — Per User / Vehicle</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              Aggregated per registered user (and vehicle category). Unregistered vehicles show as "Unregistered".
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={styles.metaChip}>
              Unique Vehicles: {fmtInt(parkingRevenue?.totals?.unique_vehicles)}
            </span>
            <span style={styles.metaChip}>
              Registered Users: {fmtInt(parkingRevenue?.totals?.unique_registered_users)}
            </span>
            <span style={styles.metaChip}>
              Total Income: {fmtInt(parkingRevenue?.totals?.total_revenue_bdt)} ৳
            </span>
          </div>
        </div>
        <div style={styles.chartCard}>
          {(!parkingRevenue?.rows?.length) ? (
            <EmptyState label="No parking session data yet. Completed parking sessions appear here grouped by user/vehicle." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      { k: 'user_name', label: 'User' },
                      { k: 'vehicle_category', label: 'Vehicle' },
                      { k: 'total_sessions', label: 'Visits' },
                      { k: 'completed_sessions', label: 'Completed' },
                      { k: 'active_sessions', label: 'Active Now' },
                      { k: 'avg_duration_min', label: 'Avg Stay' },
                      { k: 'revenue_bdt', label: 'Total Income ৳' },
                      { k: 'last_seen_at', label: 'Last Seen' },
                    ].map(c => (
                      <th key={c.k} style={{
                        textAlign: ['user_name','vehicle_category','last_seen_at'].includes(c.k) ? 'left' : 'right',
                        ...styles.th,
                      }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parkingRevenue.rows.map((p, idx) => (
                    <tr key={`${p.user_id}-${p.vehicle_category}-${idx}`} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{p.user_name}</span>
                          {p.user_id > 0 && (
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>
                              ID #{p.user_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 999,
                          background: p.vehicle_category === 'Car' ? 'rgba(124,77,255,0.12)' : 'rgba(38,166,154,0.12)',
                          color: p.vehicle_category === 'Car' ? '#6C63FF' : '#00897B',
                          fontWeight: 800, fontSize: 11,
                        }}>
                          {p.vehicle_category === 'Car' ? '🚗' : '🚲'} {p.vehicle_category}
                        </span>
                      </td>
                      <td style={styles.tdR}>{fmtInt(p.total_sessions)}</td>
                      <td style={styles.tdR}>{fmtInt(p.completed_sessions)}</td>
                      <td style={styles.tdR}>
                        {p.active_sessions > 0 ? (
                          <span style={{ color: 'var(--info-text)', fontWeight: 800 }}>
                            {fmtInt(p.active_sessions)}
                          </span>
                        ) : <span style={{ opacity: 0.4 }}>0</span>}
                      </td>
                      <td style={styles.tdR}>
                        {p.avg_duration_min > 0 ? `${fmtInt(p.avg_duration_min)}m` : '—'}
                      </td>
                      <td style={{
                        ...styles.tdR,
                        fontWeight: 900,
                        color: 'var(--primary-color)',
                        fontSize: 13,
                      }}>{fmtInt(p.revenue_bdt)} ৳</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {p.last_seen_at ? new Date(p.last_seen_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ ...styles.tr, background: 'var(--bg-hover)', fontWeight: 900 }}>
                    <td colSpan={2} style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                      GRAND TOTAL ({parkingRevenue.totals.total_sessions} sessions · {parkingRevenue.totals.unique_vehicles} vehicles)
                    </td>
                    <td style={styles.tdR}>{fmtInt(parkingRevenue.totals.total_sessions)}</td>
                    <td style={styles.tdR}>{fmtInt(parkingRevenue.totals.completed)}</td>
                    <td style={styles.tdR}>—</td>
                    <td style={styles.tdR}>—</td>
                    <td colSpan={2} style={{
                      ...styles.tdR,
                      color: 'var(--primary-color)',
                      fontSize: 14,
                    }}>{fmtInt(parkingRevenue.totals.total_revenue_bdt)} ৳</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ================= Helpers =================
function fmtInt(v: number | undefined | null) {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}
function fmtPct(v: number | undefined | null) {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return (Math.round(n * 10) / 10).toFixed(1);
}
function shortDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(5);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ================= Sub components =================
function KpiCard({ icon, label, value, sub, tone }:
  { icon: string; label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'revenue' }) {
  const accent =
    tone === 'good' ? 'rgba(76, 175, 80, 0.12)' :
      tone === 'bad' ? 'rgba(244, 67, 54, 0.12)' :
        tone === 'revenue' ? 'rgba(124, 77, 255, 0.12)' :
          'var(--bg-hover)';
  const accentText =
    tone === 'good' ? '#2E7D32' :
      tone === 'bad' ? '#C62828' :
        tone === 'revenue' ? '#6C63FF' :
          'var(--text-primary)';
  return (
    <div style={{
      ...styles.kpiCard,
      background: `linear-gradient(135deg, var(--bg-card) 0%, ${accent} 100%)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: accentText, lineHeight: 1.2, marginTop: 4, letterSpacing: -0.3 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, fontWeight: 600 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.8 }}>{icon}</div>
      </div>
    </div>
  );
}
function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {items.map(i => (
        <div key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: i.color, display: 'inline-block' }} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
function EmptyState({ label, small }: { label: string; small?: boolean }) {
  return (
    <div style={{
      padding: small ? 20 : 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-tertiary)',
      fontSize: 13,
      fontWeight: 600,
      minHeight: small ? undefined : 160,
      textAlign: 'center',
    }}>
      {label}
    </div>
  );
}
function Pill({ v, good, bad }: { v: number; good?: boolean; bad?: boolean }) {
  const bg = bad ? 'rgba(244,67,54,.14)' : good ? 'rgba(76,175,80,.14)' : 'var(--bg-hover)';
  const color = bad ? '#C62828' : good ? '#2E7D32' : 'var(--text-primary)';
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 999,
      background: bg,
      color,
      fontWeight: 800,
      fontSize: 11,
    }}>
      {fmtPct(v)}%
    </span>
  );
}
function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
function MiniMetricRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 16,
      display: 'flex',
      gap: 12,
      padding: '12px 12px 4px',
      borderTop: '1px dashed var(--border-light)',
      flexWrap: 'wrap',
    }}>{children}</div>
  );
}

function TripLine({ color, data, keyField, max, dashed }:
  { color: string; data: TripDay[]; keyField: keyof TripDay; max: number; dashed?: boolean }) {
  const pts = data.map((d, i) => {
    const x = i * 60 + 30;
    const v = Number((d as any)[keyField]) || 0;
    const y = 200 - (v / max) * 180;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={dashed ? '4 4' : undefined} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} fill={color} stroke="#fff" strokeWidth={1} />
      ))}
    </g>
  );
}

// ================= Styles =================
const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  pageTitle: { fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0', fontWeight: 500 },
  metaChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 999,
    background: 'var(--bg-hover)', color: 'var(--text-secondary)',
    fontSize: 12, fontWeight: 700,
  },
  refreshBtn: {
    padding: '9px 14px', borderRadius: 10,
    border: '1px solid var(--border-color)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontWeight: 800, fontSize: 12, cursor: 'pointer',
  },
  errorBanner: {
    padding: '12px 16px', borderRadius: 10,
    background: 'var(--danger-bg)', color: 'var(--danger-color)',
    fontSize: 13, fontWeight: 700,
  },
  section: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: 0 },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  kpiCard: {
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid var(--border-light)',
    minHeight: 96,
  },
  bulletBox: {
    marginTop: 6,
    padding: '14px 16px',
    background: 'var(--bg-hover)',
    borderRadius: 12,
    border: '1px dashed var(--border-color)',
  },
  chartCard: {
    padding: 14,
    background: 'var(--bg-primary)',
    borderRadius: 12,
    border: '1px solid var(--border-light)',
  },
  barChart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 6,
    height: 220,
    padding: '8px 4px 0',
  },
  barColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  barStack: {
    width: '80%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: 2,
    borderBottom: '1px solid var(--border-light)',
  },
  bar: {
    width: '100%',
    borderRadius: '4px 4px 0 0',
    transition: 'height .4s ease',
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700,
  },
  barTotals: {
    fontSize: 10, color: 'var(--text-primary)', fontWeight: 800,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    minWidth: 820,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid var(--border-color)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-secondary)',
    fontWeight: 800,
    background: 'var(--bg-hover)',
  },
  tr: {
    borderBottom: '1px solid var(--border-light)',
  },
  td: {
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  tdR: {
    padding: '10px 12px',
    textAlign: 'right',
    color: 'var(--text-primary)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  vehicleBox: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderRadius: 10,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    textAlign: 'center',
  },
};

const forbiddenStyles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { maxWidth: 480, textAlign: 'center', padding: '40px 32px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 4px 24px rgba(198,40,40,0.08)' },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--danger-color)', marginBottom: 12 },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
};
