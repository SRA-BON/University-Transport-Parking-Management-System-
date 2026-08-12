const Route = require('../models/Route');

exports.getAllRoutes = async (req, res) => {
  try {
    const routes = await Route.findAll();
    res.status(200).json({ routes });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
};

exports.getRouteById = async (req, res) => {
  try {
    const { id } = req.params;
    const route = await Route.findById(id);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.status(200).json(route);
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ error: 'Failed to fetch route' });
  }
};

exports.getRouteStoppages = async (req, res) => {
  try {
    const { id } = req.params;
    const stoppages = await Route.getStoppages(id);
    res.status(200).json(stoppages);
  } catch (error) {
    console.error('Error fetching stoppages:', error);
    res.status(500).json({ error: 'Failed to fetch stoppages' });
  }
};
