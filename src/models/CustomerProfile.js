const mongoose = require('mongoose');

const CustomerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  profilePicture: {
    type: String,
    default: '',
  },
  address: {
    type: String,
    default: '',
  },
  location: {
    lat: Number,
    lng: Number,
  },
  isVerified: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('CustomerProfile', CustomerProfileSchema);
