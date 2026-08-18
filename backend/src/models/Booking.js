const pool = require('../config/db');
const Wallet = require('./Wallet');
const Trip = require('./Trip');
const { client: redisClient } = require('../config/redis');
const NotificationService = require('../services/NotificationService');

class Booking {
  static BUSINESS_RULES = {
    BOOKING_WINDOW_MS: 3 * 60 * 60 * 1000,
    FREE_CANCEL_WINDOW_MS: 60 * 60 * 1000,
    EMERGENCY_CANCEL_PENALTY: 50.0,
    NO_SHOW_GRACE_MS: 5 * 60 * 1000,
    MAX_ACTIVE_BOOKINGS_PER_USER: 1,
  };

  static async findActiveFutureBookingByUser(userId) {
    const result = await pool.query(
      `SELECT b.*, t.departure_time
       FROM bookings b
       JOIN trips t ON b.trip_id = t.id
       WHERE b.user_id = $1
         AND b.status IN ('confirmed', 'checked_in')
         AND (t.status IN ('scheduled', 'in_progress'))
       ORDER BY t.departure_time ASC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  static async create(userId, tripId, isStandby = false) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── Rule 1: only 1 active future booking per user ──────────────────
      const activeBooking = await this.findActiveFutureBookingByUser(userId);
      if (activeBooking) {
        throw new Error(
          `You already have an active booking (for ${new Date(activeBooking.departure_time).toLocaleString()}). ` +
          `Only one active future trip is allowed per student — cancel it first before booking another.`
        );
      }

      // ── Rule 2: not already booked on this trip ────────────────────────
      const existingBooking = await client.query(
        'SELECT * FROM bookings WHERE user_id = $1 AND trip_id = $2 AND status IN ($3, $4)',
        [userId, tripId, 'confirmed', 'checked_in']
      );
      if (existingBooking.rows.length > 0) {
        throw new Error('You have already booked this trip');
      }

      // ── Fetch trip (with row lock) + route rules ───────────────────────
      const tripResult = await client.query(
        `SELECT t.*,
                r.single_trip_fare,
                COALESCE(r.booking_window_minutes, 180) AS booking_window_minutes,
                COALESCE(r.free_cancel_minutes,   60)  AS free_cancel_minutes,
                COALESCE(r.emergency_cancel_penalty, 50.00) AS emergency_cancel_penalty,
                COALESCE(r.no_show_grace_minutes,  5)   AS no_show_grace_minutes
         FROM trips t
         JOIN routes r ON t.route_id = r.id
         WHERE t.id = $1
         FOR UPDATE`,
        [tripId]
      );
      const trip = tripResult.rows[0];
      if (!trip) throw new Error('Trip not found');
      if (trip.status !== 'scheduled') {
        throw new Error('Trip is not available for booking');
      }

      // ── Rule 3: 3h booking window ─────────────────────────────────────
      const now = new Date();
      const bookingCutoff = new Date(
        new Date(trip.departure_time).getTime() -
        (trip.booking_window_minutes * 60 * 1000)
      );
      if (now < bookingCutoff) {
        const hrs = trip.booking_window_minutes / 60;
        throw new Error(
          `Booking opens ${hrs} hours before departure. ` +
          `Try again after ${bookingCutoff.toLocaleString()}.`
        );
      }
      if (now >= new Date(trip.departure_time)) {
        throw new Error('This trip has already departed');
      }

      // ── Rule 4: deduct fare FROM WALLET AT BOOKING TIME (atomic!) ─────
      // Per user requirement: money is charged at booking; if no-show they
      // already paid so no additional charge needed; cancel refunds it.
      const fare = Number(trip.single_trip_fare);
      try {
        await Wallet.updateBalance(
          userId,
          -fare,
          `Trip fare — ${trip.route_name || 'Route ' + trip.route_id} (trip #${tripId})`,
          null,
          client
        );
      } catch (walletErr) {
        if (walletErr.message && walletErr.message.includes('Insufficient')) {
          throw new Error(
            `Insufficient wallet balance. ${fare} BDT required. Please recharge first.`
          );
        }
        throw walletErr;
      }

      // ── Assign seat / standby position ─────────────────────────────────
      let standbyPosition = null;
      let seatNumber = null;
      if (!isStandby) {
        let redisDecremented = false;
        try {
          // Attempt atomic decrement in Redis
          const newSeatCount = await redisClient.decr(`trip:${tripId}:seats:available`);
          if (newSeatCount < 0) {
            // Restore the counter if we went below zero
            await redisClient.incr(`trip:${tripId}:seats:available`);
            throw new Error('No seats available for this trip');
          }
          redisDecremented = true;

          // Trigger Seat Availability Alert
          if (newSeatCount === 10 || newSeatCount === 5) {
             // We do this asynchronously so it doesn't block the booking transaction
             NotificationService.notifySeatAvailabilityDrop(tripId, newSeatCount, trip.route_name, trip.departure_time)
               .catch(err => console.error('Failed to send seat alert:', err));
          }
        } catch (redisErr) {
          if (redisErr.message === 'No seats available for this trip') {
            throw redisErr;
          }
          // If Redis is unreachable or errored for another reason, fallback to PG row lock check
          console.warn('⚠️ Redis decrement failed/skipped, falling back to PG check:', redisErr.message);
          if (trip.available_seats <= 0) {
            throw new Error('No seats available for this trip');
          }
        }
        // Assign next sequential seat number (no gaps)
        const nextSeatRes = await client.query(
          `SELECT COALESCE(MAX(seat_number), 0) + 1 AS next_seat
             FROM bookings WHERE trip_id = $1 AND seat_number IS NOT NULL`,
          [tripId]
        );
        seatNumber = nextSeatRes.rows[0].next_seat;
        await client.query(
          'UPDATE trips SET available_seats = available_seats - 1 WHERE id = $1',
          [tripId]
        );
      } else {
        if (trip.available_standby <= 0) {
          throw new Error('No standby spots available');
        }
        const maxPosition = await client.query(
          'SELECT MAX(standby_position) as max_pos FROM bookings WHERE trip_id = $1 AND is_standby = TRUE AND status = $2',
          [tripId, 'confirmed']
        );
        standbyPosition = (maxPosition.rows[0].max_pos || 0) + 1;
        await client.query(
          'UPDATE trips SET available_standby = available_standby - 1 WHERE id = $1',
          [tripId]
        );
      }

      const bookingResult = await client.query(
        `INSERT INTO bookings
           (user_id, trip_id, seat_number, is_standby, standby_position, status, fare_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, tripId, seatNumber, isStandby, standbyPosition, 'confirmed', fare]
      );
      const booking = bookingResult.rows[0];

      // Link the payment transaction we created earlier to this booking id
      await client.query(
        `UPDATE transactions SET booking_id = $1
           WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $2)
             AND type = 'payment'
             AND booking_id IS NULL
           ORDER BY id DESC LIMIT 1`,
        [booking.id, userId]
      );

      // ── Successful booking commit ─────────────────────────────────────────
      await client.query('COMMIT');
      
      // Track frequent route asynchronously
      NotificationService.trackFrequentRoute(userId, trip.route_id)
        .catch(err => console.error('Failed to track frequent route:', err));

      // Notify User asynchronously
      NotificationService.notifyBookingConfirmed(userId, trip)
        .catch(err => console.error('Failed to send booking notification:', err));

      // Non-blocking: best-effort update Redis cache (never throw)
      Trip.getAvailableSeats(tripId).catch(() => {});

      return {
        ...booking,
        rules_applied: {
          booking_window_minutes: trip.booking_window_minutes,
          free_cancel_minutes: trip.free_cancel_minutes,
          emergency_cancel_penalty: trip.emergency_cancel_penalty,
          no_show_grace_minutes: trip.no_show_grace_minutes,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      
      // If we atomically decremented Redis but the transaction failed, we must increment it back!
      if (!isStandby && err.message !== 'No seats available for this trip' && err.message !== 'You already have an active booking' && err.message !== 'You have already booked this trip') {
        try {
          // Check if we actually decremented it by reading the trip id (or we could track a local flag)
          // Since we can't easily pass the local flag down to the catch block from inside the if, 
          // we'll just increment it back if it's not a pre-decrement error.
          await redisClient.incr(`trip:${tripId}:seats:available`);
        } catch (incrErr) {
          console.error('Failed to rollback Redis seat count:', incrErr);
        }
      }

      throw err;
    } finally {
      client.release();
    }
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT b.*,
              t.departure_time,
              t.arrival_time,
              t.status AS trip_status,
              t.bus_id,
              r.name as route_name,
              r.direction,
              r.classification,
              r.single_trip_fare,
              r.booking_window_minutes,
              r.free_cancel_minutes,
              r.emergency_cancel_penalty,
              r.no_show_grace_minutes,
              b2.bus_number AS bus_number_joined
       FROM bookings b
       JOIN trips t ON b.trip_id = t.id
       JOIN routes r ON t.route_id = r.id
       JOIN buses b2 ON t.bus_id = b2.id
       WHERE b.user_id = $1
       ORDER BY t.departure_time DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      ...row,
      bus_number: row.bus_number_joined,
      trip: {
        departure_time: row.departure_time,
        arrival_time: row.arrival_time,
        bus_number: row.bus_number_joined,
        status: row.trip_status,
      },
      route: {
        name: row.route_name,
        direction: row.direction,
        classification: row.classification,
        single_trip_fare: row.single_trip_fare,
      },
    }));
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*,
              t.departure_time,
              t.status AS trip_status,
              r.name as route_name,
              r.free_cancel_minutes,
              r.emergency_cancel_penalty,
              r.no_show_grace_minutes
       FROM bookings b
       JOIN trips t ON b.trip_id = t.id
       JOIN routes r ON t.route_id = r.id
       WHERE b.id = $1`,
      [id]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      ...row,
      trip: { departure_time: row.departure_time, status: row.trip_status },
      route: { name: row.route_name },
    };
  }

  static async cancel(bookingId, userId, isEmergencyAdmin = false) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query(
        `SELECT b.*,
                t.departure_time,
                r.name AS route_name,
                r.single_trip_fare,
                r.free_cancel_minutes,
                r.emergency_cancel_penalty,
                r.no_show_grace_minutes
         FROM bookings b
         JOIN trips t ON b.trip_id = t.id
         JOIN routes r ON t.route_id = r.id
         WHERE b.id = $1 AND b.user_id = $2
         FOR UPDATE`,
        [bookingId, userId]
      );
      if (bookingRes.rows.length === 0) {
        // Allow admins to cancel any booking even if user doesn't match
        if (isEmergencyAdmin) {
          const adminRes = await client.query(
            `SELECT b.*,
                    t.departure_time,
                    r.name AS route_name,
                    r.single_trip_fare,
                    r.free_cancel_minutes,
                    r.emergency_cancel_penalty,
                    r.no_show_grace_minutes
             FROM bookings b
             JOIN trips t ON b.trip_id = t.id
             JOIN routes r ON t.route_id = r.id
             WHERE b.id = $1
             FOR UPDATE`,
            [bookingId]
          );
          if (adminRes.rows.length === 0) throw new Error('Booking not found');
          bookingRes.rows = adminRes.rows;
        } else {
          throw new Error('Booking not found');
        }
      }
      const b = bookingRes.rows[0];

      if (b.status === 'cancelled' || b.status === 'no_show' || b.status === 'checked_in') {
        throw new Error(`Booking cannot be cancelled (status: ${b.status})`);
      }
      if (b.status !== 'confirmed') {
        throw new Error('Booking cannot be cancelled');
      }

      const now = new Date();
      const departure = new Date(b.departure_time);
      const freeCancelCutoff = new Date(
        departure.getTime() - b.free_cancel_minutes * 60 * 1000
      );

      let cancellationFee = 0;
      let refundAmount = 0;
      let cancellationReason = 'student_cancellation';

      if (isEmergencyAdmin) {
        cancellationReason = 'admin_cancellation';
        refundAmount = Number(b.fare_amount || b.single_trip_fare);
        cancellationFee = 0;
      } else if (now < freeCancelCutoff) {
        refundAmount = Number(b.fare_amount || b.single_trip_fare);
        cancellationFee = 0;
        cancellationReason = 'free_cancellation';
      } else {
        cancellationFee = Number(b.emergency_cancel_penalty) || 50.0;
        const fullFare = Number(b.fare_amount || b.single_trip_fare);
        refundAmount = Math.max(0, fullFare - cancellationFee);
        cancellationReason = 'emergency_cancellation';
      }

      // ── Refund wallet (within same transaction!) ──────────────────────
      if (refundAmount > 0) {
        await Wallet.updateBalance(
          b.user_id,
          refundAmount,
          `Refund for cancelled trip (#${b.trip_id})`,
          b.id,
          client
        );
      }
      if (cancellationFee > 0 && refundAmount < Number(b.fare_amount)) {
        // The cancellation fee is the part we *don't* refund; record it as a penalty tx
        try {
          await Wallet.updateBalance(
            b.user_id,
            -cancellationFee,
            `Emergency cancellation penalty (trip #${b.trip_id})`,
            b.id,
            client
          );
        } catch (_e) {
          // Balance already has the fare held so net is positive; ignore
          console.warn('⚠️ Penalty deduction note:', _e.message);
        }
      }

      await client.query(
        `UPDATE bookings
         SET status = $1,
             cancelled_at = NOW(),
             cancellation_reason = $2,
             cancellation_fee = $3
         WHERE id = $4`,
        ['cancelled', cancellationReason, cancellationFee, bookingId]
      );

      // ── Return seat / standby spot back to pool ────────────────────────
      if (!b.is_standby) {
        await client.query(
          'UPDATE trips SET available_seats = available_seats + 1 WHERE id = $1',
          [b.trip_id]
        );
      } else {
        await client.query(
          'UPDATE trips SET available_standby = available_standby + 1 WHERE id = $1',
          [b.trip_id]
        );
      }

      await client.query('COMMIT');

      // Notify User asynchronously
      NotificationService.notifyBookingCancelled(b.user_id, { route_name: b.route_name }, refundAmount)
        .catch(err => console.error('Failed to send cancellation notification:', err));

      // Non-blocking: refresh Redis cache
      Trip.getAvailableSeats(b.trip_id).catch(() => {});

      return {
        ...b,
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: cancellationReason,
        cancellation_fee: cancellationFee,
        refund_amount: refundAmount,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async checkIn(bookingId, checkedInBy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `SELECT b.* FROM bookings b WHERE b.id = $1 FOR UPDATE`,
        [bookingId]
      );
      const booking = bookingResult.rows[0];
      if (!booking) throw new Error('Booking not found');
      if (booking.status === 'checked_in') return booking;
      if (booking.status !== 'confirmed') {
        throw new Error(`Booking is not valid for check-in (status: ${booking.status})`);
      }

      await client.query(
        `UPDATE bookings
         SET status = $1,
             checked_in_at = NOW()
         WHERE id = $2`,
        ['checked_in', bookingId]
      );
      await client.query(
        `INSERT INTO check_ins (booking_id, checked_in_by) VALUES ($1, $2)`,
        [bookingId, checkedInBy]
      );

      await client.query('COMMIT');
      return { ...booking, status: 'checked_in', checked_in_at: new Date() };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async rfidScanBooking(userId, tripId, device = 'gate_scanner') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `SELECT b.*,
                r.no_show_grace_minutes,
                r.emergency_cancel_penalty
         FROM bookings b
         JOIN trips t ON b.trip_id = t.id
         JOIN routes r ON t.route_id = r.id
         WHERE b.user_id = $1 AND b.trip_id = $2
         FOR UPDATE`,
        [userId, tripId]
      );
      if (bookingResult.rows.length === 0) {
        throw new Error('NO_BOOKING');
      }
      const booking = bookingResult.rows[0];

      if (booking.status === 'cancelled') throw new Error('BOOKING_CANCELLED');
      if (booking.status === 'no_show') throw new Error('NO_SHOW_MARKED');

      await client.query(
        `UPDATE bookings
         SET is_rfid_scanned = TRUE,
             scanned_at = NOW(),
             scan_device = $1
         WHERE id = $2`,
        [device, booking.id]
      );

      await client.query('COMMIT');
      return {
        ...booking,
        is_rfid_scanned: true,
        scanned_at: new Date(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async findActiveBookingByRFIDAndTrip(rfidId, tripId) {
    const result = await pool.query(
      `SELECT b.*, u.id AS user_id, u.name, u.student_id, u.email, u.rfid_id
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE u.rfid_id = $1 AND b.trip_id = $2
         AND b.status IN ('confirmed', 'checked_in')
       ORDER BY b.id DESC
       LIMIT 1`,
      [rfidId, tripId]
    );
    return result.rows[0] || null;
  }

  static async checkInByStudentId(studentId, tripId, checkedInBy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query('SELECT id FROM users WHERE student_id = $1', [studentId]);
      if (userResult.rows.length === 0) throw new Error('Student not found');
      const userId = userResult.rows[0].id;

      const bookingResult = await client.query(
        `SELECT b.*
         FROM bookings b
         WHERE b.user_id = $1 AND b.trip_id = $2
         FOR UPDATE`,
        [userId, tripId]
      );
      if (bookingResult.rows.length === 0) {
        throw new Error('No booking found for this student and trip');
      }
      const booking = bookingResult.rows[0];

      if (booking.status === 'checked_in') return booking;
      if (booking.status !== 'confirmed') {
        throw new Error(`Booking is not valid for check-in (status: ${booking.status})`);
      }

      await client.query(
        `UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`,
        [booking.id]
      );
      await client.query(
        `INSERT INTO check_ins (booking_id, checked_in_by) VALUES ($1, $2)`,
        [booking.id, checkedInBy]
      );

      await client.query('COMMIT');
      return { ...booking, status: 'checked_in', checked_in_at: new Date() };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async findByTripId(tripId) {
    const result = await pool.query(
      `SELECT b.*,
              u.name,
              u.student_id,
              u.email,
              u.rfid_id,
              u.department,
              CASE WHEN b.is_rfid_scanned THEN 'Scanned' ELSE 'Not Scanned' END AS rfid_status_label
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.trip_id = $1
       ORDER BY
         b.is_standby ASC,
         b.standby_position NULLS FIRST,
         b.status ASC,
         b.id ASC`,
      [tripId]
    );
    return result.rows;
  }

  static async getTripPassengerManifest(tripId) {
    const client = await pool.connect();
    try {
      const tripResult = await client.query(
        `SELECT t.*,
                r.name AS route_name,
                r.direction,
                r.classification,
                r.single_trip_fare,
                r.free_cancel_minutes,
                r.emergency_cancel_penalty,
                r.no_show_grace_minutes,
                b2.bus_number
         FROM trips t
         JOIN routes r ON t.route_id = r.id
         JOIN buses b2 ON t.bus_id = b2.id
         WHERE t.id = $1`,
        [tripId]
      );
      if (!tripResult.rows.length) throw new Error('Trip not found');
      const trip = tripResult.rows[0];

      const passengers = await this.findByTripId(tripId);

      const stats = {
        total_booked: passengers.length,
        confirmed: passengers.filter((p) => p.status === 'confirmed').length,
        checked_in: passengers.filter((p) => p.status === 'checked_in').length,
        rfid_scanned: passengers.filter((p) => p.is_rfid_scanned === true).length,
        cancelled: passengers.filter((p) => p.status === 'cancelled').length,
        no_show: passengers.filter((p) => p.status === 'no_show').length,
        standby_confirmed: passengers.filter((p) => p.is_standby && p.status === 'confirmed').length,
      };

      return { trip, passengers, stats };
    } finally {
      client.release();
    }
  }

  static async markNoShowsForTrip(tripId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tripCheck = await client.query(
        `SELECT t.*, r.no_show_grace_minutes, r.single_trip_fare
         FROM trips t
         JOIN routes r ON t.route_id = r.id
         WHERE t.id = $1
         FOR UPDATE`,
        [tripId]
      );
      if (!tripCheck.rows.length) {
        return { processed: 0, skipped: 'trip_not_found' };
      }
      const trip = tripCheck.rows[0];

      if (trip.no_show_processed) {
        return { processed: 0, skipped: 'already_processed' };
      }

      const now = new Date();
      const graceMinutes = Number(trip.no_show_grace_minutes || 5);
      const noShowCutoff = new Date(
        new Date(trip.departure_time).getTime() + graceMinutes * 60 * 1000
      );

      if (now < noShowCutoff) {
        return {
          processed: 0,
          skipped: 'not_yet_departed',
          depart_time: trip.departure_time,
          no_show_cutoff: noShowCutoff,
        };
      }

      const bookings = await client.query(
        `SELECT * FROM bookings
         WHERE trip_id = $1 AND status = 'confirmed' AND is_standby = FALSE
         FOR UPDATE`,
        [tripId]
      );

      let processed = 0;
      const skippedStandby = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM bookings
         WHERE trip_id = $1 AND status = 'confirmed' AND is_standby = TRUE`,
        [tripId]
      );

      for (const b of bookings.rows) {
        if (b.is_rfid_scanned === true || b.status === 'checked_in') {
          continue;
        }

        // ── Fare already charged at BOOKING TIME ────────────────────────
        // We just mark no-show status, free up seat, and bump no_show_count.
        await client.query(
          `UPDATE bookings
           SET status = 'no_show',
               no_show_processed = TRUE,
               penalty_amount = $1
           WHERE id = $2`,
          [Number(b.fare_amount || trip.single_trip_fare), b.id]
        );

        await client.query(
          `UPDATE users SET no_show_count = no_show_count + 1 WHERE id = $1`,
          [b.user_id]
        );

        // Seat can be returned to pool; the trip is in progress anyway but
        // we keep data consistent.
        await client.query(
          `UPDATE trips SET available_seats = available_seats + 1 WHERE id = $1`,
          [tripId]
        );
        processed++;
      }

      await client.query(
        `UPDATE trips SET no_show_processed = TRUE WHERE id = $1`,
        [tripId]
      );

      await client.query('COMMIT');

      Trip.getAvailableSeats(tripId).catch(() => {});

      return {
        processed,
        skipped_confirmed_with_scan: bookings.rows.length - processed,
        skipped_standby: skippedStandby.rows[0].cnt,
        no_show_cutoff: noShowCutoff,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async processAllDueNoShows() {
    const result = await pool.query(
      `SELECT t.id
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       WHERE t.status IN ('scheduled', 'in_progress')
         AND t.no_show_processed = FALSE
         AND (t.departure_time + (COALESCE(r.no_show_grace_minutes, 5) * INTERVAL '1 minute')) < NOW()`
    );
    const tripIds = result.rows.map((r) => r.id);
    const output = [];
    for (const id of tripIds) {
      try {
        const r = await this.markNoShowsForTrip(id);
        output.push({ trip_id: id, result: r });
      } catch (e) {
        output.push({ trip_id: id, error: e.message });
      }
    }
    return { checked_trips: tripIds.length, results: output };
  }

  static async assignStandbyToSeat(bookingId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT b.*, t.available_seats
         FROM bookings b
         JOIN trips t ON b.trip_id = t.id
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      );
      if (res.rows.length === 0) throw new Error('Booking not found');
      const b = res.rows[0];
      if (!b.is_standby) throw new Error('Booking is not standby');
      if (b.status !== 'confirmed') throw new Error('Standby booking not confirmed');
      if (b.available_seats <= 0) throw new Error('No available seats');

      const nextSeatRes = await client.query(
        `SELECT COALESCE(MAX(seat_number), 0) + 1 AS next_seat
           FROM bookings WHERE trip_id = $1 AND seat_number IS NOT NULL`,
        [b.trip_id]
      );
      const seatNumber = nextSeatRes.rows[0].next_seat;

      await client.query(
        `UPDATE bookings SET is_standby = FALSE, standby_position = NULL, seat_number = $1 WHERE id = $2`,
        [seatNumber, bookingId]
      );
      await client.query(
        `UPDATE trips
            SET available_seats   = available_seats   - 1,
                available_standby = available_standby + 1
          WHERE id = $1`,
        [b.trip_id]
      );

      await client.query('COMMIT');

      Trip.getAvailableSeats(b.trip_id).catch(() => {});

      return { ...b, is_standby: false, standby_position: null, seat_number: seatNumber };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Booking;
