const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const Media = require('../models/Media');
const path = require('path');

// @desc    Upload an image
// @route   POST /api/upload/image
// @access  Private
router.post('/image', protect, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = req.file.fieldname + '-' + uniqueSuffix + path.extname(req.file.originalname);

        // Save to MongoDB
        const newMedia = await Media.create({
            filename: filename,
            contentType: req.file.mimetype,
            data: req.file.buffer
        });

        const host = req.get('host');
        // We use the new API route to serve the image
        const imageUrl = `${req.protocol}://${host}/api/upload/file/${filename}`;

        res.status(200).json({
            success: true,
            message: 'Image saved to database successfully',
            url: imageUrl,
            filename: filename
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// @desc    Serve an image from MongoDB
// @route   GET /api/upload/file/:filename
// @access  Public
router.get('/file/:filename', async (req, res) => {
    try {
        const media = await Media.findOne({ filename: req.params.filename });

        if (!media) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        res.set('Content-Type', media.contentType);
        res.send(media.data);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
