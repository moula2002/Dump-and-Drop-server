const express = require('express');
const router = express.Router();
const { updatePaymentStatus, getPaymentDetails, getOrCreatePayment } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.get('/:id', protect, getPaymentDetails);
router.post('/ride/:rideId', protect, getOrCreatePayment);
router.patch('/:id/status', protect, updatePaymentStatus);

module.exports = router;
