const Trip = require('../models/Trip');
const NotificationService = require('../services/NotificationService');
const pool = require('../config/db');

exports.getAllTrips = async (req, res) => {
  try {
    const { routeId, direction } = req.query;
    const trips = await Trip.findAll({ routeId, direction });
    res.status(200).json({ trips });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const { id } = req.params;
    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // fetch available seats directly from Redis to ensure it's up to date
    const availableSeats = await Trip.getAvailableSeats(id);
    trip.available_seats = availableSeats;
    
    res.status(200).json({ trip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createTrip = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    const { busId, routeId, departureTime, arrivalTime } = req.body;
    if (!busId || !routeId || !departureTime || !arrivalTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const trip = await Trip.create({ busId, routeId, departureTime, arrivalTime });
    res.status(201).json({ message: 'Trip created successfully', trip });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateTripStatus = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer', 'bus_attendant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const { id } = req.params;
    const { status, delayTime } = req.body;

    // ── Enforce one-way status flow ──────────────────────────────────────────
    // pending → scheduled → in_progress → completed
    //         ↘ cancelled → (restart back to scheduled)
    const ALLOWED_TRANSITIONS = {
      pending:     ['scheduled', 'cancelled'],
      scheduled:   ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed:   ['scheduled'],   // manager can restart if needed
      cancelled:   ['scheduled'],   // manager can also restart if trip was accidentally cancelled
    };

    const current = await pool.query('SELECT status FROM trips WHERE id = $1', [id]);
    if (!current.rows.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const currentStatus = current.rows[0].status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition trip from "${currentStatus}" to "${status}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`
      });
    }

    const trip = await Trip.updateStatus(id, status, delayTime);

    // Reconcile stale counters after a terminal/restart status change.
    Trip.refreshAvailableSeats(id).catch(err => {
      console.error('Failed to refresh trip seat cache after status update:', err);
    });

    if (status === 'in_progress') {
      const BookingModel = require('../models/Booking');
      BookingModel.markNoShowsForTrip(id, true).catch(err => {
        console.error('Failed to mark no-shows on trip start:', err);
      });

      NotificationService.notifyTripTracking(id)
        .catch(err => console.error('Failed to send trip tracking notifications:', err));
    }

    res.status(200).json({ message: 'Trip status updated', trip });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


exports.deleteTrip = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM trips WHERE id = $1', [id]);

    res.status(200).json({ message: 'Trip deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
