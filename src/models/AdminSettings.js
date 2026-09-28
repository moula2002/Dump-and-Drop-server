const mongoose = require('mongoose');

const AdminSettingsSchema = new mongoose.Schema({
  pricePerKm: {
    type: Number,
    default: 10, // Default ₹10/km
  },
  commissionPercentage: {
    type: Number,
    default: 20, // Default 20%
  },
  gstPercentage: {
    type: Number,
    default: 18, // Default 18% on commission
  },
  bookingRules: {
    type: String,
    default: 'Automatic',
  },
  cancellationRules: {
    type: String,
    default: 'Standard',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('AdminSettings', AdminSettingsSchema);
