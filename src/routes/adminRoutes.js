const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/adminAuth');
const {
  adminLogin,
  getDashboardStats,
  getRevenueData,
  getUsers,
  getUserDetails,
  getUserById,
  updateUserStatus,
  getDrivers,
  getDriverById,
  verifyDriver,
  getRides,
  adminCancelRide,
  getSettings,
  updateSettings,
  getPendingVerifications,
  getVerificationDetails,
  approveVerification,
  rejectVerification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotification,
  getNotificationStats,
  getCommissionSettings,
  updateCommissionSettings,
  getDriverCommission,
  getPayments,
  getPaymentById,
  updatePaymentStatus,
  getTransactions,
  getPayouts,
  getDriverWallet,
  processPayout,
  createPayout,
  getPayoutSummary,
  getAllBookings,
  cancelBooking,
  exportBookings,
  getRevenueReports,
  getCancelledRides,
  exportCancelledRides,
  generateReport,
  exportRevenueReport,
  getRentalsList,
  getPasswordResetRequests,
  approvePasswordReset
} = require('../controllers/adminController');

// Public
router.post('/login', adminLogin);
router.get('/commission', getCommissionSettings);

// Protected
router.use(protectAdmin);

// Dashboard
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/revenue', getRevenueData);

// Users
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/status', updateUserStatus);

// Drivers
router.get('/drivers', getDrivers);
router.get('/drivers/:id', getDriverById);
router.put('/drivers/:id/verify', verifyDriver);

// Rides
router.get('/rides', getRides);
router.put('/rides/:id/cancel', adminCancelRide);

// Commission & Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Driver Verifications
router.get('/verifications/pending', getPendingVerifications);
router.get('/verifications/:id', getVerificationDetails);
router.post('/verifications/:id/approve', approveVerification);
router.post('/verifications/:id/reject', rejectVerification);


router.get('/notifications', getNotifications);
router.get('/notifications/stats', getNotificationStats);
router.put('/notifications/:id/read', markAsRead);
router.put('/notifications/read-all', markAllAsRead);
router.delete('/notifications/:id', deleteNotification);
router.post('/notifications/send', sendNotification);

router.put('/commission', updateCommissionSettings);
router.get('/commission/driver', getDriverCommission);

router.get('/payments', getPayments);
router.get('/payments/:id', getPaymentById);
router.put('/payments/:id/status', updatePaymentStatus);

router.get('/payouts', getPayouts);
router.get('/payouts/summary', getPayoutSummary);
router.get('/payouts/drivers/:driverId/wallet', getDriverWallet);
router.put('/payouts/:id/process', processPayout);
router.post('/payouts/create', createPayout);


// Transactions
router.get('/transactions', getTransactions);

// Bookings
router.get('/bookings', getAllBookings);
router.put('/bookings/:id/cancel', cancelBooking);
router.get('/bookings/export', exportBookings);

// Revenue Reports
router.get('/revenue-reports', getRevenueReports);
router.get('/reports/revenue/export', exportRevenueReport);

// Cancelled Rides
router.get('/cancelled-rides', getCancelledRides);
router.get('/cancelled-rides/export', exportCancelledRides);

router.get('/reports/generate', generateReport);

router.get('/rentals-list', getRentalsList);

// Password Resets
router.get('/password-resets', getPasswordResetRequests);
router.put('/password-resets/:id/approve', approvePasswordReset);

module.exports = router;