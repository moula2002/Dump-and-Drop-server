const mongoose = require('mongoose');

const GoodsDriverProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  profilePicture: {
    type: String,
  },
  dob: {
    type: String,
  },
  address: {
    type: String,
  },
  pincode: {
    type: String,
  },
  emergencyName: {
    type: String,
  },
  emergencyPhone: {
    type: String,
  },
  vehicleType: {
    type: String, // e.g., 'Truck', 'Mini Truck', 'Pickup'
  },
  brand: {
    type: String,
  },
  model: {
    type: String,
  },
  year: {
    type: String,
  },
  color: {
    type: String,
  },
  capacity: {
    type: String, // e.g., '1.5', '2.5'
  },
  vehicleTypeId: {
    type: String,
  },
  vehicleSize: {
    type: String,
  },
  permitNumber: {
    type: String,
  },
  regNumber: {
    type: String,
  },
  rcNumber: {
    type: String,
  },
  rcPhotoUrl: {
    type: String,
  },
  permitPhotoUrl: {
    type: String,
  },
  insuranceNumber: {
    type: String,
  },
  insuranceExpiry: {
    type: String,
  },
  insurancePhotoUrl: {
    type: String,
  },
  pucExpiry: {
    type: String,
  },
  pucPhotoUrl: {
    type: String,
  },
  vehiclePhotoUrl: {
    type: String,
  },
  upiId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  onboardingCompleted: {
    type: Boolean,
    default: false,
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  location: {
    lat: Number,
    lng: Number,
  },
  rating: {
    type: Number,
    default: 5.0,
  },
  totalRatings: {
    type: Number,
    default: 0,
  },
  totalRides: {
    type: Number,
    default: 0,
  },
  todayEarnings: {
    type: Number,
    default: 0.0,
  },
  weeklyEarnings: {
    type: Number,
    default: 0.0,
  },
  totalEarnings: {
    type: Number,
    default: 0.0,
  },
  monthlyEarnings: {
    type: Number,
    default: 0.0,
  },

}, {
  timestamps: true,
});

module.exports = mongoose.model('GoodsDriverProfile', GoodsDriverProfileSchema);
