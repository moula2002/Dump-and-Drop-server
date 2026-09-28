const express = require('express');
const router = express.Router();
const {
    publishRental,
    getPublishedRentals,
    submitCounterOffer,
    acceptCounterOffer,
    verifyOTP,
    finishRental,
    getHistory,
    getOffers,
    getActiveRental,
    cancelRental,
    customerCounterOffer,
    driverRespondCounter
} = require('../controllers/rentalController');
const { protect } = require('../middleware/auth');

router.post('/publish', protect, publishRental);
router.get('/published', protect, getPublishedRentals);
router.post('/counter-offer', protect, submitCounterOffer);
router.post('/accept-offer', protect, acceptCounterOffer); // existing
router.post('/customer-counter', protect, customerCounterOffer);
router.post('/driver-respond-counter', protect, driverRespondCounter);
router.post('/verify-otp', protect, verifyOTP);
router.patch('/:id/finish', protect, finishRental);
router.patch('/:id/cancel', protect, cancelRental);
router.get('/history', protect, getHistory);
router.get('/offers', protect, getOffers);
router.get('/active', protect, getActiveRental);

module.exports = router;
