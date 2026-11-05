const express = require('express');
const router = express.Router();
const {
  register,
  login,
  updateFcmToken,
  sendOTP,
  verifyOTP,
  resetPassword,
  forgotPassword,
  changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// @route   POST /api/auth/register
router.post('/register', register);

// @route   POST /api/auth/login
router.post('/login', login);

// @route   POST /api/auth/send-otp
router.post('/send-otp', sendOTP);

// @route   POST /api/auth/verify-otp
router.post('/verify-otp', verifyOTP);

// @route   POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

// @route   POST /api/auth/forgot-password (alias for send-otp)
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/change-password
router.post('/change-password', protect, changePassword);

// @route   PATCH /api/auth/fcm-token
router.patch('/fcm-token', protect, updateFcmToken);

module.exports = router;
