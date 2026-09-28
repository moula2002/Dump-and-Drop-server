const Chat = require('../models/Chat');
const User = require('../models/User');

// @desc    Ensure a chat exists between two users
// @route   POST /api/chats/ensure
// @access  Private
exports.ensureChat = async (req, res) => {
    try {
        const { chatId, participantId } = req.body;
        const currentId = req.user._id;

        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            const me = await User.findById(currentId);
            const other = await User.findById(participantId);

            if (!other) {
                return res.status(404).json({ success: false, message: 'Recipient not found' });
            }

            chat = await Chat.create({
                chatId,
                participants: [currentId, participantId],
                participantNames: {
                    [currentId.toString()]: me.name || 'User',
                    [participantId.toString()]: other.name || 'User'
                }
            });
        }

        res.status(200).json({ success: true, chat });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get messages for a chat
// @route   GET /api/chats/:chatId/messages
// @access  Private
exports.getChatMessages = async (req, res) => {
    try {
        const chat = await Chat.findOne({ chatId: req.params.chatId });

        if (!chat) {
            return res.status(200).json({ success: true, messages: [] });
        }

        res.status(200).json({ success: true, messages: chat.messages });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Send a message
// @route   POST /api/chats/:chatId/messages
// @access  Private
exports.sendMessage = async (req, res) => {
    try {
        const { text, type } = req.body;
        const currentId = req.user._id;

        const chat = await Chat.findOne({ chatId: req.params.chatId });
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        const newMessage = {
            senderId: currentId,
            text,
            type: type || 'text',
            createdAt: new Date()
        };

        chat.messages.push(newMessage);
        chat.lastMessage = text;
        chat.lastUpdated = new Date();
        
        await chat.save();

        res.status(200).json({ success: true, message: 'Message sent', data: newMessage });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all chats for current user
// @route   GET /api/chats
// @access  Private
exports.getChats = async (req, res) => {
    try {
        const currentId = req.user._id;
        const chats = await Chat.find({ participants: currentId })
                        .sort({ lastUpdated: -1 });

        res.status(200).json({ success: true, chats });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};
