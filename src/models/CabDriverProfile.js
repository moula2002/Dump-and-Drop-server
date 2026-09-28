const mongoose = require('mongoose');

const CabDriverProfileSchema = new mongoose.Schema({
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
    type: String, // Or Date
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
  idType: {
    type: String,
    enum: ['Aadhaar', 'PAN', 'Passport'],
  },
  idNumber: {
    type: String,
  },
  idFrontUrl: {
    type: String,
  },
  idBackUrl: {
    type: String,
  },
  dlNumber: {
    type: String,
  },
  dlValidFrom: {
    type: String,
  },
  dlValidTo: {
    type: String,
  },
  dlFrontUrl: {
    type: String,
  },
  dlBackUrl: {
    type: String,
  },
  seatCapacity: {
    type: String,
  },
  isAC: {
    type: Boolean,
    default: true,
  },
  vehicleType: {
    type: String,
    enum: ['Car', 'Van', 'SUV'],
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
  regNumber: {
    type: String,
  },
  rcNumber: {
    type: String,
  },
  rcPhotoUrl: {
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
    default: 0,
  },
  monthlyEarnings: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },

}, {
  timestamps: true,
});

module.exports = mongoose.model('CabDriverProfile', CabDriverProfileSchema);
