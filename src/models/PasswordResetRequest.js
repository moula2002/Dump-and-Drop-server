const mongoose = require('mongoose');

const PasswordResetRequestSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'resolved'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('PasswordResetRequest', PasswordResetRequestSchema);
