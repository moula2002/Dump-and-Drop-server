const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

/**
 * WalletService handles all driver financial movements
 */
class WalletService {
  /**
   * Get or create a wallet for a driver
   */
  static async getOrCreateWallet(driverId) {
    let wallet = await Wallet.findOne({ driverId });
    if (!wallet) {
      wallet = await Wallet.create({
        driverId,
        balance: 0,
        currency: 'INR'
      });
    }
    return wallet;
  }

  /**
   * Process a booking payment (Cash or Online)
   * @param {Object} booking - The booking object from Ride model
   * @param {String} driverId - The driver UID
   * @param {String} rideId - The ride UID
   */
  static async processBookingPayment(booking, driverId, rideId) {
    const wallet = await this.getOrCreateWallet(driverId);
    if (!booking.pricing) return;

    const { customerAmount, commissionAmount, gstAmount, driverPayout } = booking.pricing;
    
    // Total company cut (Commission + GST)
    const companyCut = (commissionAmount || 0) + (gstAmount || 0);

    if (booking.paymentMode === 'cash') {
      /**
       * CASH MODE:
       * Driver collects FULL amount from customer.
       * Driver OWES the commission to the company.
       * Action: DEBIT (Commission + GST) from wallet.
       */
      wallet.balance -= companyCut;
      
      await Transaction.create({
        walletId: wallet._id,
        driverId,
        amount: companyCut,
        type: 'DEBIT',
        category: 'commission',
        rideId,
        bookingId: booking.id,
        description: `Commission for booking from ${booking.fromCity} to ${booking.toCity} (Cash)`
      });

    } else {
      /**
       * ONLINE MODE:
       * Company collects FULL amount from customer.
       * Company OWES the payout to the driver.
       * Action: CREDIT (Driver Payout) to wallet.
       */
      wallet.balance += driverPayout;

      await Transaction.create({
        walletId: wallet._id,
        driverId,
        amount: driverPayout,
        type: 'CREDIT',
        category: 'online_payment',
        rideId,
        bookingId: booking.id,
        description: `Payout for booking from ${booking.fromCity} to ${booking.toCity} (Online)`
      });
    }

    wallet.lastUpdated = new Date();
    await wallet.save();
    return wallet;
  }

  /**
   * Check if driver is allowed to work (Balance > -500)
   */
  static async isDriverEligible(driverId) {
    const wallet = await this.getOrCreateWallet(driverId);
    return {
      eligible: wallet.balance >= -100000,
      balance: wallet.balance
    };
  }
}

module.exports = WalletService;
