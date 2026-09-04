const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/BookingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// ── Static routes FIRST (before parameter routes) ──
router.get('/active/summary', BookingController.getActiveBookingSummary);
router.post('/', BookingController.createBooking);
router.get('/', BookingController.getUserBookings);
router.post('/checkin/student', BookingController.checkInByStudentId);
router.post('/rfid/gate-scan', BookingController.rfidGateScan);
router.post('/self-scan', BookingController.selfScan); // student self-boarding (bypass RFID hardware)
router.get('/trip/:tripId', BookingController.getBookingsByTripId);
router.get('/trip/:tripId/manifest', BookingController.getTripManifest);
router.post('/trip/:tripId/run-no-show', BookingController.runNoShowForTrip);
router.post('/no-show/run-all', BookingController.runAllNoShows);

// ── Parameter routes LAST ──
router.get('/:id', BookingController.getBookingById);
router.post('/:id/cancel', BookingController.cancelBooking);
router.post('/:id/checkin', BookingController.checkIn);
router.post('/:id/assign-seat', BookingController.assignStandbyToSeat);

module.exports = router;
