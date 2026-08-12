const Trip = require('../models/Trip');

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
    if (!['manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden. Only managers and developers can create trips.' });
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
    if (!['manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { id } = req.params;
    const { status, delayTime } = req.body;
    
    const trip = await Trip.updateStatus(id, status, delayTime);
    res.status(200).json({ message: 'Trip status updated', trip });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteTrip = async (req, res) => {
  try {
    if (!['manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden. Only managers can delete trips.' });
    }

    const { id } = req.params;
    // Assuming Trip.delete(id) exists or we just use pool.query
    const pool = require('../config/db');
    await pool.query('DELETE FROM trips WHERE id = $1', [id]);

    res.status(200).json({ message: 'Trip deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
