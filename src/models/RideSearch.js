const mongoose = require('mongoose');

const RideSearchSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fromCity: {
    type: String,
    required: true,
    index: true
  },
  toCity: {
    type: String,
    required: true,
    index: true
  },
  seats: {
    type: Number,
    default: 1
  },
  date: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  fcmToken: {
    type: String,
    index: true
  }
}, {
  timestamps: true
});

// Auto-delete document after 1 hour (3600 seconds)
RideSearchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('RideSearch', RideSearchSchema);
