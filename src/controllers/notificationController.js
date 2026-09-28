const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ toUserId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            notifications
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update notification status
// @route   PATCH /api/notifications/:id
// @access  Private
exports.updateNotificationStatus = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, toUserId: req.user._id },
            { $set: req.body },
            { returnDocument: 'after' }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.status(200).json({
            success: true,
            notification
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Mark all as read
// @route   POST /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { toUserId: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};
