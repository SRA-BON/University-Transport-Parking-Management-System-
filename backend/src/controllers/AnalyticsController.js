const pool = require('../config/db');

class AnalyticsController {
  static async getDashboard(req, res) {
    try {
      const summary = await this.getSummaryStats();
      const bookingTrend = await this.getBookingTrend();
      const tripTrend = await this.getTripTrend();
      const perRoute = await this.getPerRouteMetrics();
      const parking = await this.getParkingReport();
      const tripRevenue = await this.getTripRevenueReport();
      const parkingRevenue = await this.getParkingRevenueReport();

      const summaryBullets = this.buildSummaryBullets({ summary, bookingTrend, tripTrend, perRoute, parking });

      res.json({
        summary,
        booking_trend: bookingTrend,
        trip_trend: tripTrend,
        per_route: perRoute,
        parking,
        trip_revenue: tripRevenue,
        parking_revenue: parkingRevenue,
        summary_bullets: summaryBullets,
        generated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Analytics dashboard error:', e);
      res.status(500).json({ error: e.message || 'Failed to build analytics report' });
    }
  }

  static async getBookingTrend(req, res) {
    try {
      const data = await this.getBookingTrend();
      res.json({ booking_trend: data });
    } catch (e) {
      console.error('Booking trend error:', e);
      res.status(500).json({ error: e.message });
    }
  }

  static async getTripTrend(req, res) {
    try {
      const data = await this.getTripTrend();
      res.json({ trip_trend: data });
    } catch (e) {
      console.error('Trip trend error:', e);
      res.status(500).json({ error: e.message });
    }
  }

  static async getPerRoute(req, res) {
    try {
      const data = await this.getPerRouteMetrics();
      res.json({ per_route: data });
    } catch (e) {
      console.error('Per route error:', e);
      res.status(500).json({ error: e.message });
    }
  }

  static async getParking(req, res) {
    try {
      const data = await this.getParkingReport();
      res.json({ parking: data });
    } catch (e) {
      console.error('Parking report error:', e);
      res.status(500).json({ error: e.message });
    }
  }

  // ============ Core query helpers ============

  static async getSummaryStats() {
    const totalBookingsQ = pool.query('SELECT COUNT(*)::bigint AS cnt FROM bookings');
    const completedTripsQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM trips WHERE status = 'completed'");
    const activeTripsQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM trips WHERE status = 'in_progress'");
    const noShowCountQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM bookings WHERE status = 'no_show'");
    const confirmedCountQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM bookings WHERE status IN ('confirmed','checked_in')");
    const cancelledCountQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM bookings WHERE status = 'cancelled'");
    const revenueQ = pool.query(
      "SELECT COALESCE(SUM(fare_amount), 0)::numeric AS revenue FROM bookings WHERE status IN ('confirmed','checked_in','no_show')"
    );
    const parkingRevenueQ = pool.query(
      "SELECT COALESCE(SUM(fee), 0)::numeric AS revenue FROM parking_sessions WHERE status = 'completed'"
    );
    const totalTripsQ = pool.query('SELECT COUNT(*)::bigint AS cnt FROM trips');
    const activeParkersQ = pool.query("SELECT COUNT(*)::bigint AS cnt FROM parking_sessions WHERE status = 'active'");
    const capacityQ = pool.query(
      'SELECT car_total_spots, car_occupied_spots, bike_total_spots, bike_occupied_spots FROM parking_capacity ORDER BY id DESC LIMIT 1'
    );

    const [
      tb, ct, at, ns, cf, cc, rev, pr, tt, ap, cap,
    ] = await Promise.all([
      totalBookingsQ, completedTripsQ, activeTripsQ, noShowCountQ, confirmedCountQ,
      cancelledCountQ, revenueQ, parkingRevenueQ, totalTripsQ, activeParkersQ, capacityQ,
    ]);

    const totalBookings = Number(tb.rows[0].cnt);
    const noShow = Number(ns.rows[0].cnt);
    const cancelled = Number(cc.rows[0].cnt);
    const fulfilled = Number(cf.rows[0].cnt);
    const denom = fulfilled + noShow + cancelled || 1;
    const noShowRate = Number(((noShow / denom) * 100).toFixed(2));
    const fulfilmentRate = Number(((fulfilled / denom) * 100).toFixed(2));
    const cancellationRate = Number(((cancelled / denom) * 100).toFixed(2));
    const capacity = cap.rows[0] || { car_total_spots: 200, car_occupied_spots: 0, bike_total_spots: 400, bike_occupied_spots: 0 };
    const carTotal = Number(capacity.car_total_spots || 0);
    const bikeTotal = Number(capacity.bike_total_spots || 0);
    const carOcc = Number(capacity.car_occupied_spots || 0);
    const bikeOcc = Number(capacity.bike_occupied_spots || 0);
    const parkingOccRate = carTotal + bikeTotal > 0
      ? Number((((carOcc + bikeOcc) / (carTotal + bikeTotal)) * 100).toFixed(2))
      : 0;

    return {
      total_bookings: totalBookings,
      fulfilled_bookings: fulfilled,
      no_show_bookings: noShow,
      cancelled_bookings: cancelled,
      no_show_rate_pct: noShowRate,
      fulfilment_rate_pct: fulfilmentRate,
      cancellation_rate_pct: cancellationRate,
      total_trips: Number(tt.rows[0].cnt),
      completed_trips: Number(ct.rows[0].cnt),
      active_trips: Number(at.rows[0].cnt),
      booking_revenue_bdt: Number(rev.rows[0].revenue),
      parking_revenue_bdt: Number(pr.rows[0].revenue),
      total_revenue_bdt: Number(rev.rows[0].revenue) + Number(pr.rows[0].revenue),
      parking_active_sessions: Number(ap.rows[0].cnt),
      parking_occupancy_pct: parkingOccRate,
      parking_capacity: {
        car_total: carTotal,
        car_occupied: carOcc,
        car_available: Math.max(0, carTotal - carOcc),
        bike_total: bikeTotal,
        bike_occupied: bikeOcc,
        bike_available: Math.max(0, bikeTotal - bikeOcc),
      },
    };
  }

  static async getBookingTrend(days = 14) {
    const res = await pool.query(`
      SELECT
        DATE_TRUNC('day', b.booked_at)::date AS day,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS fulfilled,
        COUNT(*) FILTER (WHERE b.status = 'no_show')::int AS no_show,
        COUNT(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(CASE WHEN b.status IN ('confirmed','checked_in','no_show') THEN b.fare_amount ELSE 0 END), 0)::numeric AS revenue_bdt
      FROM bookings b
      WHERE b.booked_at >= NOW() - ($1::text || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `, [days]);

    return res.rows.map(r => ({
      day: r.day.toISOString ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      total: Number(r.total),
      fulfilled: Number(r.fulfilled),
      no_show: Number(r.no_show),
      cancelled: Number(r.cancelled),
      revenue_bdt: Number(r.revenue_bdt),
    }));
  }

  static async getTripTrend(days = 14) {
    const res = await pool.query(`
      SELECT
        DATE_TRUNC('day', t.departure_time)::date AS day,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE t.status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE t.status = 'delayed')::int AS delayed,
        COUNT(*) FILTER (WHERE t.status IN ('scheduled','pending'))::int AS scheduled
      FROM trips t
      WHERE t.departure_time >= NOW() - ($1::text || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `, [days]);

    return res.rows.map(r => ({
      day: r.day.toISOString ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      total: Number(r.total),
      completed: Number(r.completed),
      in_progress: Number(r.in_progress),
      cancelled: Number(r.cancelled),
      delayed: Number(r.delayed),
      scheduled: Number(r.scheduled),
    }));
  }

  static async getPerRouteMetrics() {
    const res = await pool.query(`
      SELECT
        r.id AS route_id,
        r.name AS route_name,
        r.direction,
        r.classification,
        COUNT(DISTINCT t.id)::int AS trip_count,
        COUNT(b.id)::int AS booking_count,
        COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS fulfilled,
        COUNT(b.id) FILTER (WHERE b.status = 'no_show')::int AS no_show,
        COUNT(b.id) FILTER (WHERE b.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(CASE WHEN b.status IN ('confirmed','checked_in','no_show') THEN b.fare_amount ELSE 0 END), 0)::numeric AS revenue_bdt,
        COALESCE(AVG(CASE
          WHEN b.seat_number IS NOT NULL AND b.is_standby = FALSE AND b.status IN ('confirmed','checked_in','no_show') THEN 1
          ELSE NULL
        END), 0)::numeric AS seat_utilization_ratio
      FROM routes r
      LEFT JOIN trips t ON t.route_id = r.id
      LEFT JOIN bookings b ON b.trip_id = t.id
      GROUP BY r.id, r.name, r.direction, r.classification
      ORDER BY booking_count DESC, r.name ASC
    `);

    return res.rows.map(r => {
      const denom = Number(r.fulfilled) + Number(r.no_show) + Number(r.cancelled);
      const noShowRate = denom > 0 ? Number(((Number(r.no_show) / denom) * 100).toFixed(2)) : 0;
      const cancelRate = denom > 0 ? Number(((Number(r.cancelled) / denom) * 100).toFixed(2)) : 0;
      const fulfilRate = denom > 0 ? Number(((Number(r.fulfilled) / denom) * 100).toFixed(2)) : 0;
      const tripsForAvg = Math.max(1, Number(r.trip_count));
      const avgBookingsPerTrip = Number((Number(r.booking_count) / tripsForAvg).toFixed(2));
      return {
        route_id: Number(r.route_id),
        route_name: r.route_name,
        direction: r.direction,
        classification: r.classification,
        trip_count: Number(r.trip_count),
        booking_count: Number(r.booking_count),
        fulfilled: Number(r.fulfilled),
        no_show: Number(r.no_show),
        cancelled: Number(r.cancelled),
        revenue_bdt: Number(r.revenue_bdt),
        avg_bookings_per_trip: avgBookingsPerTrip,
        no_show_rate_pct: noShowRate,
        cancellation_rate_pct: cancelRate,
        fulfilment_rate_pct: fulfilRate,
      };
    });
  }

  static async getParkingReport() {
    const capacityQ = pool.query(
      'SELECT car_total_spots, car_occupied_spots, bike_total_spots, bike_occupied_spots FROM parking_capacity ORDER BY id DESC LIMIT 1'
    );
    const sessions7Q = pool.query(`
      SELECT
        DATE_TRUNC('day', ps.entry_time)::date AS day,
        COUNT(*)::int AS entries,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::int AS exits,
        COALESCE(SUM(ps.fee) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS revenue_bdt,
        COALESCE(AVG(ps.duration_minutes) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS avg_duration_min
      FROM parking_sessions ps
      WHERE ps.entry_time >= NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    const breakdownQ = pool.query(`
      SELECT
        CASE
          WHEN vehicle_reg_no LIKE '%-Ga %' THEN 'car'
          ELSE 'bike'
        END AS vehicle_category,
        COUNT(*)::int AS total_sessions,
        COALESCE(SUM(fee) FILTER (WHERE status = 'completed'), 0)::numeric AS revenue_bdt
      FROM parking_sessions
      WHERE entry_time >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);
    const peakHourQ = pool.query(`
      SELECT
        EXTRACT(HOUR FROM entry_time)::int AS hour_of_day,
        COUNT(*)::int AS entries
      FROM parking_sessions
      WHERE entry_time >= NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY entries DESC
      LIMIT 5
    `);

    const [cap, sessions, breakdown, peak] = await Promise.all([capacityQ, sessions7Q, breakdownQ, peakHourQ]);
    const capacity = cap.rows[0] || { car_total_spots: 200, car_occupied_spots: 0, bike_total_spots: 400, bike_occupied_spots: 0 };
    const carTotal = Number(capacity.car_total_spots || 0);
    const bikeTotal = Number(capacity.bike_total_spots || 0);
    const carOcc = Number(capacity.car_occupied_spots || 0);
    const bikeOcc = Number(capacity.bike_occupied_spots || 0);
    const totalSpots = carTotal + bikeTotal;
    const totalOcc = carOcc + bikeOcc;

    const sessionsDaily = sessions.rows.map(r => ({
      day: r.day.toISOString ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      entries: Number(r.entries),
      exits: Number(r.exits),
      revenue_bdt: Number(r.revenue_bdt),
      avg_duration_min: Number(r.avg_duration_min),
    }));

    const freq30 = Number((await pool.query(
      "SELECT COUNT(*)::bigint AS cnt FROM parking_sessions WHERE entry_time >= NOW() - INTERVAL '30 days'"
    )).rows[0].cnt);
    const rev30 = Number((await pool.query(
      "SELECT COALESCE(SUM(fee), 0)::numeric AS rev FROM parking_sessions WHERE status = 'completed' AND entry_time >= NOW() - INTERVAL '30 days'"
    )).rows[0].rev);

    return {
      capacity: {
        total_spots: totalSpots,
        total_occupied: totalOcc,
        total_available: Math.max(0, totalSpots - totalOcc),
        occupancy_pct: totalSpots > 0 ? Number(((totalOcc / totalSpots) * 100).toFixed(2)) : 0,
        car: {
          total: carTotal, occupied: carOcc, available: Math.max(0, carTotal - carOcc),
          occupancy_pct: carTotal > 0 ? Number(((carOcc / carTotal) * 100).toFixed(2)) : 0,
        },
        bike: {
          total: bikeTotal, occupied: bikeOcc, available: Math.max(0, bikeTotal - bikeOcc),
          occupancy_pct: bikeTotal > 0 ? Number(((bikeOcc / bikeTotal) * 100).toFixed(2)) : 0,
        },
      },
      daily: sessionsDaily,
      last_30_days: {
        total_sessions: freq30,
        revenue_bdt: rev30,
        avg_sessions_per_day: sessionsDaily.length > 0
          ? Number((sessionsDaily.reduce((a, d) => a + d.entries, 0) / sessionsDaily.length).toFixed(2))
          : 0,
      },
      breakdown_by_vehicle: breakdown.rows.map(r => ({
        category: r.vehicle_category,
        sessions: Number(r.total_sessions),
        revenue_bdt: Number(r.revenue_bdt),
      })),
      peak_hours: peak.rows.map(r => ({
        hour_of_day: Number(r.hour_of_day),
        hour_label: `${String(r.hour_of_day).padStart(2, '0')}:00`,
        entries: Number(r.entries),
      })),
    };
  }

  static async getTripRevenueReport(limit = 50) {
    const res = await pool.query(`
      SELECT
        t.id AS trip_id,
        r.name AS route_name,
        r.direction,
        bu.bus_number,
        t.departure_time,
        t.status,
        COUNT(DISTINCT b.user_id)::int AS unique_users,
        COUNT(b.id)::int AS total_bookings,
        COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS fulfilled,
        COUNT(b.id) FILTER (WHERE b.status = 'no_show')::int AS no_show,
        COUNT(b.id) FILTER (WHERE b.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(b.fare_amount) FILTER (WHERE b.status IN ('confirmed','checked_in','no_show')), 0)::numeric AS fare_revenue_bdt,
        COALESCE(SUM(b.penalty_amount), 0)::numeric AS penalty_revenue_bdt,
        COALESCE(SUM(b.cancellation_fee), 0)::numeric AS cancellation_revenue_bdt,
        (
          COALESCE(SUM(b.fare_amount) FILTER (WHERE b.status IN ('confirmed','checked_in','no_show')), 0) +
          COALESCE(SUM(b.penalty_amount), 0) +
          COALESCE(SUM(b.cancellation_fee), 0)
        )::numeric AS total_revenue_bdt
      FROM trips t
      JOIN buses bu ON bu.id = t.bus_id
      JOIN routes r ON r.id = t.route_id
      LEFT JOIN bookings b ON b.trip_id = t.id
      GROUP BY t.id, r.name, r.direction, bu.bus_number, t.departure_time, t.status
      ORDER BY t.departure_time DESC
      LIMIT $1
    `, [limit]);

    return res.rows.map(r => ({
      trip_id: Number(r.trip_id),
      route_name: r.route_name,
      direction: r.direction,
      bus_number: r.bus_number,
      departure_time: r.departure_time ? new Date(r.departure_time).toISOString() : null,
      status: r.status,
      unique_users: Number(r.unique_users),
      total_bookings: Number(r.total_bookings),
      fulfilled: Number(r.fulfilled),
      no_show: Number(r.no_show),
      cancelled: Number(r.cancelled),
      fare_revenue_bdt: Number(r.fare_revenue_bdt),
      penalty_revenue_bdt: Number(r.penalty_revenue_bdt),
      cancellation_revenue_bdt: Number(r.cancellation_revenue_bdt),
      total_revenue_bdt: Number(r.total_revenue_bdt),
    }));
  }

  static async getParkingRevenueReport(limit = 50) {
    const res = await pool.query(`
      SELECT
        CASE
          WHEN ps.vehicle_reg_no LIKE '%-Ga %' THEN 'Car'
          ELSE 'Bike'
        END AS vehicle_category,
        COALESCE(u.id, 0)::int AS user_id,
        COALESCE(u.name, 'Unregistered') AS user_name,
        COUNT(ps.id)::int AS total_sessions,
        COUNT(ps.id) FILTER (WHERE ps.status = 'completed')::int AS completed_sessions,
        COUNT(ps.id) FILTER (WHERE ps.status = 'active')::int AS active_sessions,
        COALESCE(SUM(ps.fee) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS revenue_bdt,
        COALESCE(AVG(ps.duration_minutes) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS avg_duration_min,
        MIN(ps.entry_time) AS first_seen_at,
        MAX(ps.entry_time) AS last_seen_at
      FROM parking_sessions ps
      LEFT JOIN vehicles v ON v.vehicle_reg_no = ps.vehicle_reg_no
      LEFT JOIN users u ON u.id = v.user_id
      GROUP BY 1, 2, 3
      ORDER BY revenue_bdt DESC, total_sessions DESC
      LIMIT $1
    `, [limit]);

    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::int AS completed,
        COUNT(DISTINCT ps.vehicle_reg_no)::int AS unique_vehicles,
        COUNT(DISTINCT
          CASE
            WHEN v.user_id IS NOT NULL THEN v.user_id::text
            ELSE NULL
          END
        )::int AS unique_registered_users,
        COALESCE(SUM(ps.fee) FILTER (WHERE ps.status = 'completed'), 0)::numeric AS total_revenue_bdt
      FROM parking_sessions ps
      LEFT JOIN vehicles v ON v.vehicle_reg_no = ps.vehicle_reg_no
    `);

    return {
      rows: res.rows.map(r => ({
        vehicle_category: r.vehicle_category,
        user_id: Number(r.user_id),
        user_name: r.user_name,
        total_sessions: Number(r.total_sessions),
        completed_sessions: Number(r.completed_sessions),
        active_sessions: Number(r.active_sessions),
        revenue_bdt: Number(r.revenue_bdt),
        avg_duration_min: Number(r.avg_duration_min),
        first_seen_at: r.first_seen_at ? new Date(r.first_seen_at).toISOString() : null,
        last_seen_at: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
      })),
      totals: {
        total_sessions: Number(totals.rows[0].total_sessions),
        completed: Number(totals.rows[0].completed),
        unique_vehicles: Number(totals.rows[0].unique_vehicles),
        unique_registered_users: Number(totals.rows[0].unique_registered_users),
        total_revenue_bdt: Number(totals.rows[0].total_revenue_bdt),
      },
    };
  }

  static buildSummaryBullets({ summary, bookingTrend, tripTrend, perRoute, parking }) {
    const bullets = [];

    // Booking trend
    if (bookingTrend.length >= 2) {
      const first = bookingTrend[0].total || 0;
      const last = bookingTrend[bookingTrend.length - 1].total || 0;
      if (first === 0) {
        bullets.push(`Bookings jumped from 0 to ${last} in the latest recorded day — early usage signal.`);
      } else {
        const pct = Math.round(((last - first) / first) * 100);
        bullets.push(`Week-over-week daily bookings are trending ${pct >= 0 ? 'UP' : 'DOWN'} by ${Math.abs(pct)}% (${first} → ${last} bookings/day).`);
      }
    }

    // No-show rate
    bullets.push(`Overall no-show rate stands at ${summary.no_show_rate_pct}% of ${summary.total_bookings} closed bookings. ${summary.no_show_rate_pct > 15 ? '⚠️ This exceeds the 15% healthy target — consider follow-ups.' : '✅ Within acceptable thresholds (< 15%).'}`);

    // Revenue
    bullets.push(`Total system revenue so far: ${summary.total_revenue_bdt.toLocaleString()} ৳ — ${summary.booking_revenue_bdt.toLocaleString()} ৳ from fares, ${summary.parking_revenue_bdt.toLocaleString()} ৳ from parking fees.`);

    // Top / worst route
    if (perRoute.length > 0) {
      const top = [...perRoute].filter(r => r.booking_count > 0).sort((a, b) => b.booking_count - a.booking_count)[0];
      const worst = [...perRoute].filter(r => r.booking_count > 0).sort((a, b) => b.no_show_rate_pct - a.no_show_rate_pct)[0];
      if (top) {
        bullets.push(`🔥 Highest-demand route: "${top.route_name}" (${top.direction}) with ${top.booking_count} bookings, ${top.fulfilment_rate_pct}% fulfilment.`);
      }
      if (worst && worst.no_show_rate_pct > 10) {
        bullets.push(`🚩 Highest no-show route: "${worst.route_name}" at ${worst.no_show_rate_pct}% — audit scheduling & student reminders.`);
      }
    }

    // Parking occupancy
    bullets.push(`Parking utilization sits at ${parking.capacity.occupancy_pct}% — ${parking.capacity.total_occupied}/${parking.capacity.total_spots} spots occupied right now.`);

    // Peak hour
    if (parking.peak_hours && parking.peak_hours[0]) {
      bullets.push(`🅿️ Busiest parking entry hour is ${parking.peak_hours[0].hour_label} with ${parking.peak_hours[0].entries} check-ins in the past 14 days.`);
    }

    // Trip completion
    if (summary.total_trips > 0) {
      const tripComp = Math.round((summary.completed_trips / summary.total_trips) * 100);
      bullets.push(`Trips completed: ${summary.completed_trips}/${summary.total_trips} (${tripComp}%). Active en-route right now: ${summary.active_trips}.`);
    }

    return bullets;
  }
}

AnalyticsController.getDashboard = AnalyticsController.getDashboard.bind(AnalyticsController);
AnalyticsController.getBookingTrend = AnalyticsController.getBookingTrend.bind(AnalyticsController);
AnalyticsController.getTripTrend = AnalyticsController.getTripTrend.bind(AnalyticsController);
AnalyticsController.getPerRoute = AnalyticsController.getPerRoute.bind(AnalyticsController);
AnalyticsController.getParking = AnalyticsController.getParking.bind(AnalyticsController);
AnalyticsController.getTripRevenueReport = AnalyticsController.getTripRevenueReport.bind(AnalyticsController);
AnalyticsController.getParkingRevenueReport = AnalyticsController.getParkingRevenueReport.bind(AnalyticsController);

module.exports = AnalyticsController;
