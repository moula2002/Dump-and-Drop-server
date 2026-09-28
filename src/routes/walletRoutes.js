const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

router.get('/my', protect, walletController.getMyWallet);
router.post('/topup', protect, walletController.topupWallet);
router.post('/payout', protect, walletController.payoutWallet);

module.exports = router;
