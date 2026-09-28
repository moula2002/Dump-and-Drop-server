const express = require('express');
const router = express.Router();
const { register, login, updateFcmToken, forgotPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// @route   POST /api/auth/register
router.post('/register', register);

// @route   POST /api/auth/login
router.post('/login', login);

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/change-password
router.post('/change-password', protect, require('../controllers/authController').changePassword);

// @route   PATCH /api/auth/fcm-token
router.patch('/fcm-token', protect, updateFcmToken);

module.exports = router;
