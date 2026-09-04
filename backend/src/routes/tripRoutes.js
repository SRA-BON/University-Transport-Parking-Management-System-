const express = require('express');
const router = express.Router();
const TripController = require('../controllers/TripController');
const TripLocationController = require('../controllers/TripLocationController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// ── Public specific routes (before any :id patterns) ──────────────────
router.get('/', TripController.getAllTrips);
router.get('/active/locations', TripLocationController.getAllActiveTripsWithLocations);

// ── Protected specific routes (before any :id patterns) ────────────────
router.get('/me/active-trip', authMiddleware, TripLocationController.getMyActiveTrip);

// ── Public dynamic :id routes ──────────────────────────────────────────
router.get('/:id', TripController.getTripById);
router.get('/:id/location', TripLocationController.getTripLocation);
router.get('/:id/location/history', TripLocationController.getTripLocationHistory);

// ── All remaining protected routes ─────────────────────────────────────
router.use(authMiddleware);
// Management staff only (roleMiddleware bypass covers super_admin/admin/manager/developer)
router.post('/', roleMiddleware([]), TripController.createTrip);
// Bus attendant + management staff can update trip status and location
router.put('/:id/status', roleMiddleware(['bus_attendant']), TripController.updateTripStatus);
router.delete('/:id', roleMiddleware([]), TripController.deleteTrip);
router.post('/:id/location', roleMiddleware(['bus_attendant']), TripLocationController.updateLocation);

module.exports = router;
