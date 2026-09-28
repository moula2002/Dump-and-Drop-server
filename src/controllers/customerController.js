const User = require('../models/User');
const CustomerProfile = require('../models/CustomerProfile');

// @desc    Update customer profile
// @route   PUT /api/customer/profile
// @access  Private (Customer only)
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, profilePicture, address } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if profile exists
    let profile = await CustomerProfile.findOne({ userId: req.user._id });

    if (!profile) {
      // Create profile
      profile = await CustomerProfile.create({
        userId: req.user._id,
        name,
        email,
        profilePicture,
        address,
      });
    } else {
      // Update profile
      profile.name = name || profile.name;
      profile.email = email || profile.email;
      profile.profilePicture = profilePicture || profile.profilePicture;
      profile.address = address || profile.address;
      await profile.save();
    }

    // Mark user profile as complete
    user.name = name || user.name;
    user.profileComplete = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profile,
      user,
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get customer profile
// @route   GET /api/customer/profile
// @access  Private (Customer only)
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const profile = await CustomerProfile.findOne({ userId: req.user._id });

    if (!profile) {
      return res.status(200).json({
        success: true,
        data: {
          phone: user ? user.phone : ''
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...profile.toObject(),
        phone: user ? user.phone : ''
      },
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
// @desc    Update customer location
// @route   PATCH /api/customer/location
// @access  Private (Customer only)
exports.updateLocation = async (req, res) => {
    try {
      const { lat, lng } = req.body;
      let profile = await CustomerProfile.findOne({ userId: req.user._id });
      
      if (!profile) {
        const user = await User.findById(req.user._id);
        profile = await CustomerProfile.create({
          userId: req.user._id,
          name: user ? (user.name || 'Passenger') : 'Passenger',
          location: { lat, lng }
        });
      } else {
        profile.location = { lat, lng };
        await profile.save();
      }
  
      res.status(200).json({ success: true, message: 'Location updated' });
    } catch (error) {

    res.status(500).json({ success: false, message: 'Server error' });
  }
};
