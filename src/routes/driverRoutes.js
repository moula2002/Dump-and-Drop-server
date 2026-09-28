const express = require('express');
const router = express.Router();
const { onboardDriver, getProfile, toggleStatus, updateRentalSettings } = require('../controllers/driverController');

const { protect } = require('../middleware/auth');

router.post('/onboarding', protect, onboardDriver);
router.get('/profile', protect, getProfile);
router.patch('/profile', protect, onboardDriver); // Handle profile updates using the same logic
router.patch('/status', protect, toggleStatus);
router.patch('/rental-settings', protect, updateRentalSettings);

module.exports = router;
