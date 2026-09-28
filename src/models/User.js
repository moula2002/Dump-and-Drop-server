const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: false, // For backwards compatibility with existing OTP users
  },
  role: {
    type: String,
    enum: ['customer', 'goods_driver', 'cab_driver'],
    required: [true, 'Role is required'],
  },
  name: {
    type: String,
    default: '',
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  isAdminVerified: {
    type: Boolean,
    default: false,
  },
  profileComplete: {
    type: Boolean,
    default: false,
  },
  fcmToken: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', UserSchema);
