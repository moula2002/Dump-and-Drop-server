const express = require('express');
const router = express.Router();
const { 
  getNotifications, 
  updateNotificationStatus, 
  markAllAsRead 
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getNotifications);
router.post('/read-all', protect, markAllAsRead);
router.patch('/:id', protect, updateNotificationStatus);

module.exports = router;
