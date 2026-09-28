const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const seedAdmin = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dump_and_drop');
        
        const adminId = '69d8d397c9f7b178ee5d56b0';
        let exists = await Admin.findById(adminId);
        
        if (!exists) {
            await Admin.create({
                _id: new mongoose.Types.ObjectId(adminId),
                name: 'Super Admin',
                email: 'admin@dumpdrop.com',
                password: 'Admin@123',
                role: 'super_admin',
                isActive: true,
            });
            console.log('✅ Admin with ID 69d8d397c9f7b178ee5d56b0 created successfully!');
        } else {
            console.log('⚠️ Admin with ID 69d8d397c9f7b178ee5d56b0 already exists');
        }
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

seedAdmin();
