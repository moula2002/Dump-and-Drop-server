const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry time is required'],
    index: { expires: 0 }, // Automatically delete when current time > expiresAt
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('OTP', OTPSchema);
