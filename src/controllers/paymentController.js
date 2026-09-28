const Payment = require('../models/Payment');
const Ride = require('../models/Ride');

// @desc    Update payment status
// @route   PATCH /api/payment/:id/status
// @access  Private
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    payment.status = status;
    if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
    if (razorpayOrderId) payment.razorpayOrderId = razorpayOrderId;
    if (razorpaySignature) payment.razorpaySignature = razorpaySignature;
    payment.updatedAt = new Date();
    await payment.save();

    // If payment is successful, updated ride status too
    if (status === 'paid') {
        const ride = await Ride.findById(payment.rideId);
        if (ride) {
            ride.status = 'completed';
            ride.paymentStatus = 'paid';
            await ride.save();
        }
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get payment details
// @route   GET /api/payment/:id
// @access  Private
exports.getPaymentDetails = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found',
            });
        }

        res.status(200).json({
            success: true,
            data: payment,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// @desc    Get or create payment for a ride
// @route   POST /api/payment/ride/:rideId
// @access  Private
exports.getOrCreatePayment = async (req, res) => {
    try {
        const { rideId } = req.params;
        let payment = await Payment.findOne({ rideId, status: 'pending' });

        if (!payment) {
            const ride = await Ride.findById(rideId);
            if (!ride) {
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }

            payment = await Payment.create({
                rideId,
                customerId: ride.customerId,
                driverId: ride.driverId,
                amount: ride.price || 0,
                currency: ride.currency || 'INR',
                status: 'pending',
            });
        }

        res.status(200).json({
            success: true,
            data: payment,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
