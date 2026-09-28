const express = require('express');
const router = express.Router();
const { ensureChat, getChatMessages, sendMessage, getChats } = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getChats);
router.post('/ensure', protect, ensureChat);
router.get('/:chatId/messages', protect, getChatMessages);
router.post('/:chatId/messages', protect, sendMessage);

module.exports = router;
