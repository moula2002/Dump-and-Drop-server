const multer = require('multer');
const path = require('path');

// Use memory storage so we can save to MongoDB
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Very permissive filter to debug the upload issue
    console.log(`Incoming upload: origName=${file.originalname}, mime=${file.mimetype}`);
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for modern smartphone cameras
    fileFilter: fileFilter
});

module.exports = upload;
