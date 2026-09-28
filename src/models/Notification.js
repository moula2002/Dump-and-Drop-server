const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        default: 'info'
    },
    relatedRideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride'
    },
    relatedDriverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    relatedCustomerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    extra: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', NotificationSchema);
