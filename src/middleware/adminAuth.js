const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const protectAdmin = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔵 Token received:', token.substring(0, 20) + '...');
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🟢 Decoded token:', decoded);
      
      req.admin = await Admin.findById(decoded.id).select('-password');
      if (!req.admin) {
        console.log('🔴 Admin not found for ID:', decoded.id);
        return res.status(401).json({ success: false, message: 'Admin not found' });
      }
      console.log('✅ Admin authenticated:', req.admin.email);
      next();
    } catch (error) {
      console.error('❌ Admin auth error:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed: ' + error.message });
    }
  }
  if (!token) {
    console.log('🔴 No token provided');
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
};

module.exports = { protectAdmin };
