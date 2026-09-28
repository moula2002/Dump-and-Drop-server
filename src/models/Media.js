const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    unique: true
  },
  contentType: {
    type: String,
    required: true
  },
  data: {
    type: Buffer,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'media' // Explicitly setting the collection name as requested
});

module.exports = mongoose.model('Media', MediaSchema);
