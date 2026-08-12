
const express = require('express');
const router = express.Router();
const ParkingController = require('../controllers/ParkingController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes for RFID scanners
router.post('/entry', ParkingController.createEntry);
router.post('/exit', ParkingController.createExit);

// Protected routes
router.use(authMiddleware);
router.get('/districts', ParkingController.getDistricts);
router.get('/vehicles', ParkingController.getVehicles);
router.post('/vehicles', ParkingController.addVehicle);
router.put('/vehicles/:id', ParkingController.updateVehicle);
router.delete('/vehicles/:id', ParkingController.deleteVehicle);
router.put('/vehicles/:id/default', ParkingController.setDefaultVehicle);
router.get('/profile', ParkingController.getProfile);
router.post('/profile', ParkingController.createProfile);
router.get('/sessions', ParkingController.getSessions);
router.get('/sessions/active', ParkingController.getActiveSession);
router.get('/capacity', ParkingController.getParkingCapacity);
router.put('/capacity', ParkingController.updateCapacity);
router.get('/fee-rate', ParkingController.getParkingFeeRate);
router.put('/fee-rate', ParkingController.updateFeeRate);

module.exports = router;
