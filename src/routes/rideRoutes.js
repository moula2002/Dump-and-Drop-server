const express = require('express');
const router = express.Router();
const {
  requestRide,
  getAvailableRides,
  acceptRide,
  cancelRide,
  finishRide,
  getRideDetails,
  createDraftRide,
  updateRide,
  getMyRides,
  getMyBookings,
  searchCarpoolRides,
  verifyPassengerOTP,
  bookRideSegment,
  getRideTracking,
  acceptPassenger,
  cancelBooking,
  deleteBooking,
  markNoShow,
  markPassengerPaid,
  updateRideLocation,
  submitReview
} = require('../controllers/rideController');
const { protect } = require('../middleware/auth');

router.post('/request', protect, requestRide);
router.post('/draft', protect, createDraftRide);
router.get('/available', protect, getAvailableRides);
router.get('/my', protect, getMyRides);
router.get('/bookings/my', protect, getMyBookings);
router.get('/search', protect, searchCarpoolRides);
router.post('/:id/book', protect, bookRideSegment);
router.post('/:id/accept-passenger', protect, acceptPassenger);
router.post('/:id/verify-passenger', protect, verifyPassengerOTP);
router.post('/:id/no-show', protect, markNoShow);
router.post('/:id/mark-paid', protect, markPassengerPaid);
router.get('/:id/tracking', protect, getRideTracking);
router.get('/:id', protect, getRideDetails);
router.patch('/:id', protect, updateRide);
router.patch('/:id/accept', protect, acceptRide);
router.patch('/:id/cancel', protect, cancelRide);
router.post('/:id/bookings/:bookingId/cancel', protect, cancelBooking);
router.delete('/:id/bookings/:bookingId', protect, deleteBooking);
router.patch('/:id/location', protect, updateRideLocation);
router.patch('/:id/finish', protect, finishRide);
router.post('/:id/review', protect, submitReview);

module.exports = router;
