const TripLocation = require('../models/TripLocation');
const Trip = require('../models/Trip');
const pool = require('../config/db');

exports.updateLocation = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer', 'bus_attendant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const { id } = req.params;
    const { latitude, longitude, heading, speedKmh, accuracyMeters } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const tripExists = await pool.query('SELECT 1 FROM trips WHERE id = $1', [id]);
    if (!tripExists.rows.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const location = await TripLocation.logLocation({
      tripId: id,
      latitude,
      longitude,
      heading,
      speedKmh,
      accuracyMeters,
      updatedBy: req.user.id,
    });

    res.status(200).json({ message: 'Location updated', location });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getTripLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const location = await TripLocation.getLatest(id);
    res.status(200).json({ trip, location });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTripLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(
      parseInt(req.query.limit) || 100,
      1000
    );

    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const history = await TripLocation.getHistory(id, limit);
    res.status(200).json({ trip, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyActiveTrip = async (req, res) => {
  try {
    const active = await TripLocation.getActiveTripForUser(req.user.id);
    if (!active) {
      return res.status(200).json({ active_trip: null });
    }
    const location = await TripLocation.getLatest(active.trip_id);
    res.status(200).json({ active_trip: active, location });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllActiveTripsWithLocations = async (req, res) => {
  try {
    const trips = await TripLocation.getActiveInProgressTrips();
    res.status(200).json({ trips });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
