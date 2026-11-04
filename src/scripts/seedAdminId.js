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
        const adminEmail = 'admin@dumpdrop.com';
        let exists = await Admin.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(adminId) ? adminId : null },
                { email: adminEmail }
            ]
        });
        
        if (!exists) {
            await Admin.create({
                _id: new mongoose.Types.ObjectId(adminId),
                name: 'Super Admin',
                email: adminEmail,
                password: 'Admin@123',
                role: 'super_admin',
                isActive: true,
            });
            console.log(`✅ Admin with ID ${adminId} created successfully!`);
        } else {
            console.log(`⚠️ Admin already exists (${exists.email}) with ID ${exists._id}`);
        }
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

seedAdmin();
