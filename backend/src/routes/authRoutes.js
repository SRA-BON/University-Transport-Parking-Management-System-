const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const NotificationService = require('../services/NotificationService');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/google', AuthController.googleAuth);

// Link-based password reset flow (current flow)
router.post('/forgot-password', AuthController.forgotPassword);
router.get('/reset/:token', AuthController.validateResetToken);
router.post('/set-new-password', AuthController.setNewPassword);

// Legacy OTP-based password reset endpoints (kept for backward compatibility)
router.post('/verify-otp', AuthController.verifyOtp);
router.post('/reset-password', AuthController.resetPassword);

// Protected routes
router.use(authMiddleware);
router.get('/profile', AuthController.getProfile);
router.put('/profile', AuthController.updateProfile);

router.post('/fcm-token', async (req, res) => {
  try {
    const { token, device_type } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await NotificationService.registerToken(req.user.id, token, device_type);
    res.json({ message: 'FCM token registered' });
  } catch (error) {
    console.error('FCM Token Save Error:', error);
    res.status(500).json({ error: 'Failed to save token' });
  }
});

module.exports = router;
