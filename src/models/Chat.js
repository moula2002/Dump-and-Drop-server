const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: true,
        unique: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    participantNames: {
        type: Map,
        of: String
    },
    lastMessage: {
        type: String,
        default: ''
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    messages: [{
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['text', 'image', 'location'],
            default: 'text'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);
