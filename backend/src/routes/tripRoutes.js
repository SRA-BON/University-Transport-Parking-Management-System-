const express = require('express');
const router = express.Router();
const TripController = require('../controllers/TripController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes
router.get('/', TripController.getAllTrips);
router.get('/:id', TripController.getTripById);

// Protected routes
router.use(authMiddleware);
router.post('/', TripController.createTrip);
router.put('/:id/status', TripController.updateTripStatus);
router.delete('/:id', TripController.deleteTrip);

module.exports = router;
