const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');

exports.createBooking = async (req, res) => {
  try {
    const { tripId, isStandby } = req.body;
    const userId = req.user.id;

    if (!tripId) {
      return res.status(400).json({ error: 'tripId is required' });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (trip.status !== 'scheduled') {
      return res.status(400).json({ error: 'This trip is no longer available for booking' });
    }

    const booking = await Booking.create(userId, tripId, Boolean(isStandby));
    res.status(201).json({ message: 'Booking successful', booking });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const bookings = await Booking.findByUserId(userId);
    res.status(200).json({ bookings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveBookingSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const active = await Booking.findActiveFutureBookingByUser(userId);
    if (!active) {
      return res.status(200).json({ activeBooking: null, rules: Booking.BUSINESS_RULES });
    }
    const detailed = await Booking.findById(active.id);
    res.status(200).json({ activeBooking: detailed, rules: Booking.BUSINESS_RULES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.user_id !== req.user.id && req.user.role === 'student') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(200).json({ booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = ['super_admin', 'manager', 'developer', 'admin'].includes(req.user.role);

    const cancelledBooking = await Booking.cancel(id, userId, isAdmin);
    res.status(200).json({
      message: cancelledBooking.cancellation_fee > 0
        ? `Booking cancelled — emergency fee ${cancelledBooking.cancellation_fee} BDT applied. Refund: ${cancelledBooking.refund_amount} BDT.`
        : `Booking cancelled successfully. Full refund: ${cancelledBooking.refund_amount} BDT.`,
      booking: cancelledBooking,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const checkedInBy = req.user.id;

    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Forbidden. Only management can check in.' });
    }

    const checkInResult = await Booking.checkIn(id, checkedInBy);
    res.status(200).json({ message: 'Check-in successful', booking: checkInResult });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.checkInByStudentId = async (req, res) => {
  try {
    const { studentId, tripId } = req.body;
    const checkedInBy = req.user.id;

    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const checkInResult = await Booking.checkInByStudentId(studentId, tripId, checkedInBy);
    res.status(200).json({ message: 'Check-in successful', booking: checkInResult });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.rfidGateScan = async (req, res) => {
  try {
    const { rfid_id, trip_id, device } = req.body;
    if (!rfid_id) {
      return res.status(400).json({ error: 'rfid_id is required' });
    }
    if (!trip_id) {
      return res.status(400).json({ error: 'trip_id is required — scanner must identify which bus gate it belongs to' });
    }

    console.log(`🚪 Bus gate RFID scan — rfid=${rfid_id}, trip=${trip_id}, device=${device || 'gate_scanner'}`);

    const user = await User.findByRFID(rfid_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'RFID_NOT_FOUND',
        message: 'RFID card is not registered',
      });
    }

    try {
      const result = await Booking.rfidScanBooking(user.id, trip_id, device || 'gate_scanner');

      console.log(
        `✅ Bus gate scan ok — ${user.name} (${user.student_id}) ` +
        `booking #${result.id} — was_scanned=${result.is_rfid_scanned}`
      );

      res.status(200).json({
        success: true,
        event: 'transport_gate_scan',
        message: 'RFID scanned successfully. Please proceed to board.',
        student: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          department: user.department,
          email: user.email,
          rfid_id: user.rfid_id,
        },
        booking: {
          id: result.id,
          trip_id: result.trip_id,
          status: result.status,
          is_rfid_scanned: true,
          scanned_at: result.scanned_at,
          is_standby: result.is_standby,
          standby_position: result.standby_position,
        },
      });
    } catch (bErr) {
      const msg = String(bErr.message || '');
      let code = 'SCAN_FAILED';
      let httpStatus = 400;
      let friendly = msg;

      if (msg === 'NO_BOOKING') {
        code = 'NO_BOOKING';
        friendly = 'No active booking was found for this trip on this student.';
      } else if (msg === 'BOOKING_CANCELLED') {
        code = 'BOOKING_CANCELLED';
        friendly = 'This booking has been cancelled.';
      } else if (msg === 'NO_SHOW_MARKED') {
        code = 'NO_SHOW_MARKED';
        friendly = 'Trip already closed — student was marked no-show.';
      }

      console.warn(`⚠️ Bus gate scan error for ${user.email}: ${code} — ${friendly}`);
      return res.status(httpStatus).json({
        success: false,
        error: code,
        message: friendly,
        student: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          department: user.department,
        },
      });
    }
  } catch (error) {
    console.error('❌ Bus gate scan crashed:', error);
    res.status(500).json({ error: 'Failed to process bus gate RFID scan', details: error.message });
  }
};

exports.getBookingsByTripId = async (req, res) => {
  try {
    const { tripId } = req.params;
    const bookings = await Booking.findByTripId(tripId);
    res.status(200).json({ bookings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTripManifest = async (req, res) => {
  try {
    const { tripId } = req.params;
    const manifest = await Booking.getTripPassengerManifest(tripId);

    const now = new Date();
    const depart = new Date(manifest.trip.departure_time);
    const graceMs = (Number(manifest.trip.no_show_grace_minutes) || 5) * 60 * 1000;
    manifest.can_mark_no_shows = now >= new Date(depart.getTime() + graceMs);
    manifest.departure_passed = now >= depart;
    manifest.now_utc = now.toISOString();

    res.status(200).json(manifest);
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

exports.runNoShowForTrip = async (req, res) => {
  try {
    if (!['super_admin', 'manager', 'developer', 'admin', 'bus_attendant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { tripId } = req.params;
    const result = await Booking.markNoShowsForTrip(tripId);
    res.status(200).json({ message: 'No-show pass ran for trip', result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.runAllNoShows = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const result = await Booking.processAllDueNoShows();
    res.status(200).json({ message: `No-show sweep ran for ${result.checked_trips} trips`, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignStandbyToSeat = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await Booking.assignStandbyToSeat(id);
    res.status(200).json({ message: 'Standby assigned to seat', booking: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Student self-scan (bypass RFID hardware).
 * Authenticated student calls this to record their own boarding on a trip.
 * Equivalent to a bus attendant scanning their RFID card at the gate.
 */
exports.selfScan = async (req, res) => {
  try {
    const { trip_id } = req.body;
    const userId = req.user.id;

    if (!trip_id) {
      return res.status(400).json({ error: 'trip_id is required' });
    }

    console.log(`📱 Student self-scan — userId=${userId}, trip=${trip_id}`);

    try {
      const result = await Booking.rfidScanBooking(userId, trip_id, 'self_scan_app');

      console.log(`✅ Self-scan ok — userId=${userId} booking #${result.id}`);

      res.status(200).json({
        success: true,
        event: 'transport_gate_scan',
        message: 'Boarding recorded successfully! You are now marked as on-board.',
        student: {
          id: req.user.id,
          name: req.user.name,
          student_id: req.user.student_id,
          email: req.user.email,
        },
        booking: {
          id: result.id,
          trip_id: result.trip_id,
          status: result.status,
          is_rfid_scanned: true,
          scanned_at: result.scanned_at,
          is_standby: result.is_standby,
          standby_position: result.standby_position,
        },
      });
    } catch (bErr) {
      const msg = String(bErr.message || '');
      let code = 'SCAN_FAILED';
      let friendly = msg;

      if (msg === 'NO_BOOKING')      { code = 'NO_BOOKING';      friendly = 'No active booking found for this trip.'; }
      else if (msg === 'BOOKING_CANCELLED') { code = 'BOOKING_CANCELLED'; friendly = 'This booking has been cancelled.'; }
      else if (msg === 'NO_SHOW_MARKED')    { code = 'NO_SHOW_MARKED';    friendly = 'Trip already closed — you were marked no-show.'; }

      return res.status(400).json({ success: false, error: code, message: friendly });
    }
  } catch (error) {
    console.error('❌ Self-scan crashed:', error);
    res.status(500).json({ error: 'Failed to process self-scan', details: error.message });
  }
};

