const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/AnalyticsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);
router.use(roleMiddleware(['super_admin', 'admin', 'manager', 'developer']));

router.get('/dashboard', AnalyticsController.getDashboard.bind(AnalyticsController));
router.get('/bookings/trend', AnalyticsController.getBookingTrend.bind(AnalyticsController));
router.get('/trips/trend', AnalyticsController.getTripTrend.bind(AnalyticsController));
router.get('/routes', AnalyticsController.getPerRoute.bind(AnalyticsController));
router.get('/parking', AnalyticsController.getParking.bind(AnalyticsController));

module.exports = router;
