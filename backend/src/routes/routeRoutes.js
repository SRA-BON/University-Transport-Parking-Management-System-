const express = require('express');
const router = express.Router();
const RouteController = require('../controllers/RouteController');

router.get('/', RouteController.getAllRoutes);
router.get('/:id', RouteController.getRouteById);
router.get('/:id/stoppages', RouteController.getRouteStoppages);

module.exports = router;
