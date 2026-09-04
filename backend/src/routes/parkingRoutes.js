
const express = require('express');
const router = express.Router();
const ParkingController = require('../controllers/ParkingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Public routes for RFID scanners — unified auto-detect endpoint + legacy per-action endpoints
router.post('/entry', ParkingController.createEntry);
router.post('/exit', ParkingController.createExit);
router.post('/scan', ParkingController.processScan);

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
// Requires parking attendant OR management staff (bypassed for super_admin/admin/manager/developer)
router.get('/sessions/all', roleMiddleware(['parking_attendant']), ParkingController.getAllActiveSessions);
// Student self-scan: no rfidId needed, uses req.user identity (bypass RFID hardware)
router.post('/self-scan', ParkingController.processScan);
router.get('/capacity', ParkingController.getParkingCapacity);
router.put('/capacity', roleMiddleware(['parking_attendant']), ParkingController.updateCapacity);
router.get('/fee-rate', ParkingController.getParkingFeeRate);
router.put('/fee-rate', roleMiddleware(['parking_attendant']), ParkingController.updateFeeRate);

module.exports = router;
