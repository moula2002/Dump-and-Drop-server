const User = require('../models/User');
const CabDriverProfile = require('../models/CabDriverProfile');
const GoodsDriverProfile = require('../models/GoodsDriverProfile');

// @desc    Update driver profile (Cab or Goods)
// @route   POST /api/driver/onboarding
// @access  Private (Driver only)
exports.onboardDriver = async (req, res) => {
  try {
    const { role } = req.user;
    const body = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let profile;

    if (role === 'cab_driver' || body.role === 'cab_driver' || body.driverType === 'cab_driver') {
      profile = await CabDriverProfile.findOne({ userId: req.user._id });

      if (!profile) {
        profile = await CabDriverProfile.create({
          userId: req.user._id,
          ...body,
          onboardingCompleted: true,
          status: 'pending',
        });
      } else {
        // Update fields if provided
        Object.keys(body).forEach(key => {
          profile[key] = body[key];
        });
        profile.onboardingCompleted = true;
        if (profile.status !== 'approved') {
          profile.status = 'pending';
        }
        await profile.save();
      }
      
      // Update role in User document
      user.role = 'cab_driver';
    } else if (role === 'goods_driver' || body.role === 'goods_driver' || body.driverType === 'goods_driver') {
      profile = await GoodsDriverProfile.findOne({ userId: req.user._id });

      if (!profile) {
        profile = await GoodsDriverProfile.create({
          userId: req.user._id,
          ...body,
          onboardingCompleted: true,
          status: 'pending',
        });
      } else {
        Object.keys(body).forEach(key => {
          profile[key] = body[key];
        });
        profile.onboardingCompleted = true;
        if (profile.status !== 'approved') {
          profile.status = 'pending';
        }
        await profile.save();
      }
      
      // Update role in User document
      user.role = 'goods_driver';
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized for this role',
      });
    }

    // Mark user profile as complete
    user.name = body.fullName || user.name;
    user.profileComplete = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Driver profile updated successfully',
      data: {
        ...profile.toObject(),
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get driver profile
// @route   GET /api/driver/profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    let { role } = req.user;
    let profile;

    if (role === 'cab_driver') {
      profile = await CabDriverProfile.findOne({ userId: req.user._id });
    } else if (role === 'goods_driver') {
      profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
    } else {
      // Fallback: search both profiles if role is generic 'driver' or something else
      profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
      if (profile) {
        role = 'goods_driver';
        await User.findByIdAndUpdate(req.user._id, { role: 'goods_driver' });
      } else {
        profile = await CabDriverProfile.findOne({ userId: req.user._id });
        if (profile) {
          role = 'cab_driver';
          await User.findByIdAndUpdate(req.user._id, { role: 'cab_driver' });
        }
      }
    }

    if (!profile) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...profile.toObject(),
        role: role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Toggle online status
// @route   PATCH /api/driver/status
// @access  Private
exports.toggleStatus = async (req, res) => {
  try {
    const { role } = req.user;
    const { isOnline, lat, lng } = req.body;

    let profile;
    if (role === 'cab_driver') {
        profile = await CabDriverProfile.findOne({ userId: req.user._id });
    } else if (role === 'goods_driver') {
        profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
    }

    if (!profile) {
      return res.status(404).json({
          success: false,
          message: 'Profile not found',
      });
    }

    profile.isOnline = true;
    if (lat && lng) {
        profile.location = { lat, lng };
    }
    await profile.save();

    res.status(200).json({
        success: true,
        message: 'Status updated',
        isOnline: profile.isOnline,
    });
  } catch (error) {

      res.status(500).json({
          success: false,
          message: 'Server error',
      });
  }
};

// @desc    Update rental settings
// @route   PATCH /api/driver/rental-settings
// @access  Private
exports.updateRentalSettings = async (req, res) => {
  try {
    const { role } = req.user;
    
    let profile;
    if (role === 'cab_driver') {
        profile = await CabDriverProfile.findOne({ userId: req.user._id });
    } else if (role === 'goods_driver') {
        profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
    }

    if (!profile) {
      return res.status(404).json({
          success: false,
          message: 'Profile not found',
      });
    }

    // Merge new rental settings with existing ones
    profile.rentalSettings = {
      ...profile.rentalSettings,
      ...req.body
    };

    await profile.save();

    res.status(200).json({
        success: true,
        message: 'Rental settings updated',
        rentalSettings: profile.rentalSettings,
    });
  } catch (error) {
      res.status(500).json({
          success: false,
          message: 'Server error',
      });
  }
};
