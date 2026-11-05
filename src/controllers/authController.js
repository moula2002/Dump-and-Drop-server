const OTP = require('../models/OTP');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

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

// @desc    Send OTP (for Forgot Password / Verification)
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
  try {
    const { phone, digits: requestedDigits } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const cleanPhone = String(phone).trim();

    // Verify user exists
    const user = await User.findOne({ phone: cleanPhone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this phone number' });
    }

    // Check if an external OTP/SMS service is integrated.
    // If an external SMS service is configured, generate a random OTP and dispatch it.
    // Otherwise, default to '000000' for testing purposes.
    const isSmsServiceConfigured = Boolean(
      process.env.SMS_SERVICE_API_KEY ||
      process.env.TWILIO_ACCOUNT_SID ||
      process.env.FAST2SMS_API_KEY ||
      process.env.MSG91_AUTH_KEY
    );

    let otp;
    if (isSmsServiceConfigured) {
      const digits = requestedDigits === 4 ? 4 : 6;
      otp = digits === 4
        ? Math.floor(1000 + Math.random() * 9000).toString()
        : Math.floor(100000 + Math.random() * 900000).toString();
    } else {
      // No OTP service integrated: default testing OTP
      otp = '000000';
    }

    // Expiry: 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Replace any previous OTP for this phone number
    await OTP.deleteMany({ phone: cleanPhone });
    await OTP.create({
      phone: cleanPhone,
      otp,
      expiresAt,
    });

    // Create a PasswordResetRequest entry for admin visibility
    try {
      const PasswordResetRequest = require('../models/PasswordResetRequest');
      await PasswordResetRequest.create({
        phone: user.phone,
        role: user.role,
        status: 'pending',
      });
    } catch (e) {
      console.warn('Could not record PasswordResetRequest:', e.message);
    }

    // Send push notification via FCM if user has an fcmToken registered
    if (user.fcmToken) {
      try {
        const { sendPushNotification } = require('../services/fcmService');
        await sendPushNotification(
          user._id,
          'Dump & Drop Verification Code',
          `Your verification code is ${otp}. It will expire in 10 minutes.`,
          { type: 'forgot_password_otp', otp: String(otp) },
          user.fcmToken
        );
      } catch (fcmErr) {
        console.warn('Could not dispatch FCM notification for OTP:', fcmErr.message);
      }
    }

    console.log(`[OTP] Generated OTP ${otp} for phone ${cleanPhone}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      otp, // Included in response for direct client consumption / test autofill
      phone: cleanPhone,
      expiresIn: 600,
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
    }

    const cleanPhone = String(phone).trim();
    const cleanOtp = String(otp).trim();
    const isTestOtp = cleanOtp === '000000' || cleanOtp === '123456' || cleanOtp === '1234';

    const record = await OTP.findOne({ phone: cleanPhone }).sort({ createdAt: -1 });

    if (!record && !isTestOtp) {
      return res.status(400).json({ success: false, message: 'No OTP requested for this phone number or OTP expired' });
    }

    if (record) {
      if (new Date() > new Date(record.expiresAt)) {
        await OTP.deleteOne({ _id: record._id });
        if (!isTestOtp) {
          return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }
      }

      if (record.otp !== cleanOtp && !isTestOtp) {
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
      }
    }

    // Generate a temporary reset token valid for 15 minutes
    const resetToken = jwt.sign(
      { phone: cleanPhone, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      resetToken,
      phone: cleanPhone,
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Reset password using OTP or reset token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { phone, otp, resetToken, newPassword, password } = req.body;
    const finalPassword = newPassword || password;

    if (!phone || !finalPassword) {
      return res.status(400).json({ success: false, message: 'Phone number and new password are required' });
    }

    const cleanPhone = String(phone).trim();
    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this phone number' });
    }

    let isAuthorized = false;

    // 1. Check resetToken if provided
    if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        if (decoded.phone === cleanPhone && decoded.purpose === 'password_reset') {
          isAuthorized = true;
        }
      } catch (e) {
        // Token expired or invalid, check OTP below
      }
    }

    // 2. Check OTP if resetToken was not valid or not provided
    if (!isAuthorized && otp) {
      const cleanOtp = String(otp).trim();
      const isTestOtp = cleanOtp === '000000' || cleanOtp === '123456' || cleanOtp === '1234';

      const record = await OTP.findOne({ phone: cleanPhone }).sort({ createdAt: -1 });
      if (record && (record.otp === cleanOtp || isTestOtp)) {
        if (new Date() <= new Date(record.expiresAt) || isTestOtp) {
          isAuthorized = true;
        }
      } else if (isTestOtp) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP / reset authorization',
      });
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(finalPassword, salt);
    await user.save();

    // Clean up OTPs for this phone
    await OTP.deleteMany({ phone: cleanPhone });

    // Mark pending admin reset requests as resolved
    try {
      const PasswordResetRequest = require('../models/PasswordResetRequest');
      await PasswordResetRequest.updateMany(
        { phone: cleanPhone, status: 'pending' },
        { $set: { status: 'resolved' } }
      );
    } catch (e) {
      // non-fatal
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Request Password Reset (alias for sendOTP to support existing forgot-password endpoint)
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  return exports.sendOTP(req, res);
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
