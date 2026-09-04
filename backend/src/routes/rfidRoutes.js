
const express = require('express');
const router = express.Router();
const RFIDController = require('../controllers/RFIDController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes for RFID scanners (no auth needed — hardware sends rfid_id directly)
router.post('/verify', RFIDController.verify);
router.post('/parking/entry', RFIDController.parkingEntry);
router.post('/parking/exit', RFIDController.parkingExit);
router.post('/parking/scan', RFIDController.parkingScan);

// Protected routes (require authentication)
router.use(authMiddleware);
router.get('/lookup', RFIDController.lookup);
router.post('/register', RFIDController.register);
router.post('/unregister', RFIDController.unregister);

module.exports = router;
