// src/scripts/createAdmin.js
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const Admin = require('../models/Admin');  // ../models (because scripts to models)
const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root (one level up from src)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db'); // If you have db config

const createAdmin = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        
        const exists = await Admin.findOne({ email: 'admin@dumpdrop.com' });
        
        if (!exists) {
            await Admin.create({
                name: 'Super Admin',
                email: 'admin@dumpdrop.com',
                password: '',
                role: 'super_admin',
                isActive: true,
            });
            console.log('✅ Admin created successfully!');
            console.log('   Email: admin@dumpdrop.com');
            console.log('   Password: Admin@123');
        } else {
            console.log('⚠️ Admin already exists');
        }
        
        process.exit();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

createAdmin();