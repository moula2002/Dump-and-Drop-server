const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Initialize Firebase Admin SDK
require('./services/fcmService');

// Connect to database
connectDB().then(() => {
    const Admin = require('./models/Admin');
    const mongoose = require('mongoose');
    const adminId = '69d8d397c9f7b178ee5d56b0';
    Admin.findById(adminId).then(exists => {
        if (!exists) {
            Admin.create({
                _id: new mongoose.Types.ObjectId(adminId),
                name: 'Super Admin',
                email: 'admin@dumpdrop.com',
                password: 'Admin@123',
                role: 'super_admin',
                isActive: true,
            }).then(() => {
                console.log('✅ Auto-Seeded Admin ID: 69d8d397c9f7b178ee5d56b0');
            }).catch(err => {
                console.error('❌ Auto-Seed Admin failed:', err.message);
            });
        }
    }).catch(err => {
        console.error('❌ Auto-Seed Admin check failed:', err.message);
    });
}).catch(err => {
    console.error('Database connection failed in startup hook:', err.message);
});

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const driverRoutes = require('./routes/driverRoutes');
const rideRoutes = require('./routes/rideRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const chatRoutes = require('./routes/chatRoutes');
const walletRoutes = require('./routes/walletRoutes');
const rentalRoutes = require('./routes/rentalRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminRoutes = require('./routes/adminRoutes');
const path = require('path');


const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/rental', rentalRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

// All media handled via /api/upload/file route (MongoDB)


// Basic route
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API /api prefix is working' });
});

// Handle 404 errors for unmatched routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Port
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server v1.0.3 running on port ${PORT}`);
});
