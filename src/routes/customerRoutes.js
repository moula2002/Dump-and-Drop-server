const express = require('express');
const router = express.Router();
const { updateProfile, getProfile, updateLocation } = require('../controllers/customerController');
const { protect } = require('../middleware/auth');

router.put('/profile', protect, updateProfile);
router.get('/profile', protect, getProfile);
router.patch('/location', protect, updateLocation);

module.exports = router;
