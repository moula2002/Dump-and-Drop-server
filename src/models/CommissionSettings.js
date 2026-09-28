const mongoose = require('mongoose');

const CommissionSettingsSchema = new mongoose.Schema({
    driverCommission: {
        type: Number,
        default: 80,
        required: true,
        min: 0,
        max: 100
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
}, { timestamps: true });

module.exports = mongoose.model('CommissionSettings', CommissionSettingsSchema);
