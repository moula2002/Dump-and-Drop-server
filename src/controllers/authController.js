const OTP = require('../models/OTP');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const bcrypt = require('bcryptjs');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { phone, password, role } = req.body;

    if (!phone || !password || !role) {
      return res.status(400).json({ success: false, message: 'Phone, password, and role are required' });
    }

    // Check if user already exists
    let user = await User.findOne({ phone });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists with this phone number' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = await User.create({
      phone,
      password: hashedPassword,
      role,
      isPhoneVerified: true, // Auto-verify for now
      isAdminVerified: role === 'customer', // Auto-verify customers
    });

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
        isAdminVerified: user.isAdminVerified,
        profileComplete: user.profileComplete,
        name: user.name,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Log in user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { phone, password, role } = req.body;

    if (!phone || !password || !role) {
      return res.status(400).json({ success: false, message: 'Phone, password, and role are required' });
    }

    // Find user
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid phone or password' });
    }

    // Check if password matches
    let isMatch = false;
    if (user.password) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Backwards compatibility for old users that don't have a password
      // We could force them to reset or just let them login with a default password for now.
      // Let's assume they must create a new account or reset password if they have no password.
      return res.status(400).json({ success: false, message: 'Password not set for this account. Please contact support.' });
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid phone or password' });
    }

    // Update role if they login with a different role and they are permitted
    if (user.role !== role) {
      user.role = role;
      if (role === 'customer') {
          user.isAdminVerified = true;
      }
      await user.save();
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
        isAdminVerified: user.isAdminVerified,
        profileComplete: user.profileComplete,
        name: user.name,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update user FCM token
// @route   PATCH /api/auth/fcm-token
// @access  Private
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'fcmToken is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { fcmToken } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Matching notification check for goods drivers
    if (user.role === 'goods_driver') {
      const GoodsDriverProfile = require('../models/GoodsDriverProfile');
      const Ride = require('../models/Ride');
      const { sendPushNotification } = require('../services/fcmService');

      const driverProfile = await GoodsDriverProfile.findOne({ userId: req.user._id });
      if (driverProfile && driverProfile.status === 'approved') {
        const driverVehicleId = (driverProfile.vehicleTypeId || '').toString().trim().toLowerCase();
        const driverVehicleName = (driverProfile.vehicleType || '').toString().trim().toLowerCase();
        const maxCapacityTons = parseFloat(driverProfile.capacity) || 0.0;
        const maxCapacityKg = maxCapacityTons * 1000;

        // Find active searching loads
        const activeLoads = await Ride.find({
          role: 'goods_ride',
          status: 'searching'
        });

        // Parse weight to Kg helper
        const parseWeightToKg = (wStr) => {
          if (!wStr) return 0;
          const str = String(wStr).toLowerCase().trim();
          const num = parseFloat(str) || 0;
          if (str.includes('ton')) return num * 1000;
          return num;
        };

        const matchingLoads = activeLoads.filter(ride => {
          const rideVehicleId = (ride.vehicleTypeId || '').toString().trim().toLowerCase();
          const rideVehicleName = (ride.vehicleType || '').toString().trim().toLowerCase();

          // Vehicle Type Matching
          let typeMatch = false;
          if (driverVehicleId === '' && driverVehicleName === '') {
            typeMatch = true;
          } else if (driverVehicleId === 'others' || driverVehicleId === 'other' || 
              driverVehicleName === 'others' || driverVehicleName === 'other') {
            typeMatch = true;
          } else if (rideVehicleId === 'others' || rideVehicleId === 'other' || 
              rideVehicleName === 'others' || rideVehicleName === 'other') {
            typeMatch = true;
          } else {
            typeMatch = (rideVehicleId === driverVehicleId && driverVehicleId !== '') || 
                        (rideVehicleName === driverVehicleName && driverVehicleName !== '') ||
                        (rideVehicleId === driverVehicleName && rideVehicleId !== '') ||
                        (rideVehicleName === driverVehicleId && rideVehicleName !== '');
          }

          if (!typeMatch) return false;

          // Capacity Matching
          if (maxCapacityKg > 0) {
            const rideWeight = parseWeightToKg(ride.goods && ride.goods.weight);
            if (rideWeight > maxCapacityKg) {
              return false;
            }
          }

          return true;
        });

        if (matchingLoads.length > 0) {
          const count = matchingLoads.length;
          const title = 'Matching Loads Available';
          const body = count === 1 
            ? `A new load matching your vehicle type is available.` 
            : `${count} matching loads are available. Open the app to view and accept them.`;

          await sendPushNotification(req.user._id, title, body, {
            type: 'matching_loads_available',
            count: String(count)
          }, fcmToken);
        }
      }
    }

    res.status(200).json({ success: true, message: 'FCM Token updated successfully' });
  } catch (error) {
    console.error('Error updating FCM Token:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Request Password Reset
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this phone number' });
    }

    const PasswordResetRequest = require('../models/PasswordResetRequest');
    
    await PasswordResetRequest.create({
      phone: user.phone,
      role: user.role,
      status: 'pending'
    });

    res.status(200).json({ success: true, message: 'Password reset request sent to admin' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, message: 'No password set on this account. Cannot change.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
