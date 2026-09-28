const Admin = require('../models/Admin');
const User = require('../models/User');
const Ride = require('../models/Ride');
const CabDriverProfile = require('../models/CabDriverProfile');
const GoodsDriverProfile = require('../models/GoodsDriverProfile');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Payment = require('../models/Payment');
const AdminSettings = require('../models/AdminSettings');
const CustomerProfile = require('../models/CustomerProfile'); // Add this missing import
const Notification = require('../models/Notification'); // Add this
const jwt = require('jsonwebtoken');
const CommissionSettings = require('../models/CommissionSettings');
const Rental = require('../models/Rental');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const Review = require('../models/Review');
const bcrypt = require('bcryptjs');



const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// @desc    Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: 'Account disabled' });
    }
    admin.lastLogin = new Date();
    await admin.save();
    res.json({
      success: true,
      token: generateToken(admin._id),
      user: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// backend/controllers/adminController.js

// @desc    Dashboard Stats - Complete Real Data
exports.getDashboardStats = async (req, res) => {
  try {
    console.log('Fetching dashboard stats...');

    // 30 days active users
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // This month new users
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Run basic queries in parallel to significantly reduce dashboard load time
    const [
      totalUsers,
      totalCustomers,
      totalDrivers,
      activeUsers,
      newUsersThisMonth,
      totalRides,
      totalCabRides,
      totalGoodsRides,
      completedRides,
      cancelledRides,
      ongoingRides,
      searchingRides,
      draftRides
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: { $in: ['cab_driver', 'goods_driver'] } }),
      User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Ride.countDocuments(),
      Ride.countDocuments({ role: 'cab_ride' }),
      Ride.countDocuments({ role: 'goods_ride' }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({ status: 'cancelled' }),
      Ride.countDocuments({ status: { $in: ['accepted', 'ongoing'] } }),
      Ride.countDocuments({ status: 'searching' }),
      Ride.countDocuments({ status: 'draft' })
    ]);

    // ========== REVENUE STATS ==========
    const revenueAgg = await Ride.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    const cabRevenueAgg = await Ride.aggregate([
      { $match: { status: 'completed', role: 'cab_ride' } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const cabRevenue = cabRevenueAgg[0]?.total || 0;

    const goodsRevenueAgg = await Ride.aggregate([
      { $match: { status: 'completed', role: 'goods_ride' } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const goodsRevenue = goodsRevenueAgg[0]?.total || 0;

    // Today's revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRevenueAgg = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const todayRevenue = todayRevenueAgg[0]?.total || 0;

    // This month revenue
    const thisMonthRevenueAgg = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const thisMonthRevenue = thisMonthRevenueAgg[0]?.total || 0;

    // ========== DRIVER STATS ==========
    const approvedCabDrivers = await CabDriverProfile.countDocuments({ status: 'approved' }) || 0;
    const pendingCabDrivers = await CabDriverProfile.countDocuments({ status: 'pending' }) || 0;
    const approvedGoodsDrivers = await GoodsDriverProfile.countDocuments({ status: 'approved' }) || 0;
    const pendingGoodsDrivers = await GoodsDriverProfile.countDocuments({ status: 'pending' }) || 0;

    const totalApprovedDrivers = approvedCabDrivers + approvedGoodsDrivers;
    const totalPendingDrivers = pendingCabDrivers + pendingGoodsDrivers;

    // Online drivers
    const onlineDrivers = await User.countDocuments({
      role: { $in: ['cab_driver', 'goods_driver'] },
      isOnline: true
    }) || 0;

    // ========== GROWTH CALCULATIONS ==========
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);

    const lastMonthEnd = new Date(lastMonthStart);
    lastMonthEnd.setMonth(lastMonthEnd.getMonth() + 1);
    lastMonthEnd.setDate(0);

    const lastMonthUsers = await User.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
    }) || 0;
    const userGrowth = lastMonthUsers > 0 ? Math.round(((newUsersThisMonth - lastMonthUsers) / lastMonthUsers) * 100) : 0;

    const lastMonthRides = await Ride.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
    }) || 0;
    const thisMonthRides = await Ride.countDocuments({ createdAt: { $gte: startOfMonth } }) || 0;
    const rideGrowth = lastMonthRides > 0 ? Math.round(((thisMonthRides - lastMonthRides) / lastMonthRides) * 100) : 0;

    const lastMonthRevenueAgg = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
      { $group: { _id: null, total: { $sum: { $max: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$pricePerSeat', 0] }] } } } }
    ]);
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;
    const revenueGrowth = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    // ========== COMPLETION RATE ==========
    const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0;

    // ========== COMMISSION ==========
    const commissionSettings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    const driverCommission = commissionSettings?.driverCommission || 80;
    const platformCommission = totalRevenue * ((100 - driverCommission) / 100);

    // ========== BOOKING & PAYMENT STATS ==========
    const totalBookings = await Ride.countDocuments({ 'bookings.0': { $exists: true } }) || 0;
    const totalPayments = await Payment.countDocuments({ status: 'paid' }) || 0;
    const pendingPayments = await Payment.countDocuments({ status: 'pending' }) || 0;
    const failedPayments = await Payment.countDocuments({ status: 'failed' }) || 0;

    // ========== SEND RESPONSE ==========
    const responseData = {
      totalUsers,
      totalCustomers,
      totalDrivers,
      activeUsers,
      newUsersThisMonth,
      userGrowth,
      totalRides,
      totalCabRides,
      totalGoodsRides,
      completedRides,
      cancelledRides,
      ongoingRides,
      searchingRides,
      draftRides,
      completionRate,
      rideGrowth,
      totalRevenue,
      cabRevenue,
      goodsRevenue,
      todayRevenue,
      thisMonthRevenue,
      platformCommission,
      revenueGrowth,
      totalApprovedDrivers,
      totalPendingDrivers,
      totalRejectedDrivers: 0,
      approvedCabDrivers,
      pendingCabDrivers,
      approvedGoodsDrivers,
      pendingGoodsDrivers,
      onlineDrivers,
      totalBookings,
      totalPayments,
      pendingPayments,
      failedPayments,
      driverCommission
    };

    console.log('Sending dashboard data:', responseData);

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Revenue Data for Charts
exports.getRevenueData = async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    let startDate, labels;
    const now = new Date();

    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    // Get data from database
    const rides = await Ride.find({
      createdAt: { $gte: startDate },
      status: 'completed'
    }).lean();

    // Group by day/week/month
    const revenueMap = new Map();
    rides.forEach(ride => {
      let key;
      if (period === 'week') {
        const dayIndex = ride.createdAt.getDay();
        key = dayIndex === 0 ? 7 : dayIndex;
      } else if (period === 'month') {
        key = ride.createdAt.getDate();
      } else {
        key = ride.createdAt.getMonth() + 1;
      }

      if (!revenueMap.has(key)) {
        revenueMap.set(key, { revenue: 0, rides: 0 });
      }
      const current = revenueMap.get(key);
      current.revenue += ride.price || ride.pricePerSeat || 0;
      current.rides += 1;
      revenueMap.set(key, current);
    });

    const revenueData = labels.map((label, index) => {
      let key;
      if (period === 'week') {
        key = index + 1;
      } else if (period === 'month') {
        key = index + 1;
      } else {
        key = index + 1;
      }
      const data = revenueMap.get(key) || { revenue: 0, rides: 0 };
      return {
        name: label,
        revenue: data.revenue,
        rides: data.rides
      };
    });

    // Cab vs Goods summary
    const cabRides = rides.filter(r => r.role === 'cab_ride');
    const goodsRides = rides.filter(r => r.role === 'goods_ride');

    res.json({
      success: true,
      data: revenueData,
      summary: {
        totalRevenue: revenueData.reduce((sum, d) => sum + d.revenue, 0),
        totalRides: revenueData.reduce((sum, d) => sum + d.rides, 0),
        cabRevenue: cabRides.reduce((sum, r) => sum + (r.price || 0), 0),
        goodsRevenue: goodsRides.reduce((sum, r) => sum + (r.price || 0), 0),
        cabRides: cabRides.length,
        goodsRides: goodsRides.length
      }
    });
  } catch (error) {
    console.error('Revenue data error:', error);
    res.json({ success: true, data: [] });
  }
};
// @desc    Get users list
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const query = search ? { $or: [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search } }] } : {};
    const users = await User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).lean();
    const total = await User.countDocuments(query);
    res.json({ success: true, users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single user (basic)
exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Get customer profile
    const profile = await CustomerProfile.findOne({ userId: user._id }).lean();

    res.json({
      success: true,
      data: {
        ...user,
        address: profile?.address || 'Not set',
        profilePicture: profile?.profilePicture || null,
        location: profile?.location || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get user by ID (detailed with complete information)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get user from User collection
    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get customer profile
    const profile = await CustomerProfile.findOne({ userId: id }).lean();

    // Get all rides for this customer
    const allRides = await Ride.find({ customerId: id })
      .sort({ createdAt: -1 })
      .lean();

    // Get completed rides count
    const completedRides = allRides.filter(r => r.status === 'completed').length;

    // Get cancelled rides count
    const cancelledRides = allRides.filter(r => r.status === 'cancelled').length;

    // Get total spent
    const totalSpent = allRides.reduce((sum, r) => sum + (r.price || 0), 0);

    // Get wallet balance from wallet collection (if exists)
    let walletBalance = 0;
    try {
      const Wallet = require('../models/Wallet');
      const wallet = await Wallet.findOne({ userId: id });
      walletBalance = wallet?.balance || 0;
    } catch (err) {
      console.log('Wallet model not found or error:', err.message);
    }

    // Get payments history
    let payments = [];
    try {
      const Payment = require('../models/Payment');
      payments = await Payment.find({ customerId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    } catch (err) {
      console.log('Payment model not found:', err.message);
    }

    // Get total bookings count
    const totalBookings = allRides.length;

    // Get last active date (from last ride or last login)
    const lastActive = allRides.length > 0 ? allRides[0].createdAt : user.lastLogin || user.createdAt;

    // Get rating from rides (average rating if available)
    let rating = 4.5; // default rating
    const ridesWithRating = allRides.filter(r => r.rating);
    if (ridesWithRating.length > 0) {
      const avgRating = ridesWithRating.reduce((sum, r) => sum + (r.rating || 0), 0) / ridesWithRating.length;
      rating = Math.round(avgRating * 10) / 10;
    }

    // Get referral information
    const referralCode = user.referralCode || 'N/A';
    let referrals = 0;
    try {
      referrals = await User.countDocuments({ referredBy: id });
    } catch (err) {
      console.log('Error counting referrals:', err.message);
    }

    // Get address components from profile or user
    const address = profile?.address || user.address || 'Not set';
    const city = user.city || profile?.city || 'Not set';
    const state = user.state || profile?.state || 'Not set';
    const pincode = user.pincode || profile?.pincode || 'Not set';

    // Format rides for response
    const formattedRides = allRides.slice(0, 10).map(r => ({
      id: r._id,
      from: r.fromCity || r.pickupLocation?.address || 'N/A',
      to: r.toCity || r.dropLocation?.address || 'N/A',
      date: r.createdAt,
      fare: r.price || 0,
      status: r.status,
      rideType: r.role === 'cab_ride' ? 'Cab' : 'Goods'
    }));

    // Format payments for response
    const formattedPayments = payments.map(p => ({
      id: p._id,
      transactionId: p.razorpayPaymentId || p.razorpayOrderId || p._id.toString().slice(-8),
      amount: p.amount,
      date: p.createdAt,
      status: p.status === 'paid' ? 'success' : p.status,
      mode: p.razorpayPaymentId ? 'online' : 'cash'
    }));

    res.json({
      success: true,
      data: {
        // Basic Info
        _id: user._id,
        name: profile?.name || user.name || 'N/A',
        phone: user.phone || 'N/A',
        email: profile?.email || user.email || 'Not provided',
        role: user.role,

        // Profile Info
        profilePicture: profile?.profilePicture || null,
        address: address,
        city: city,
        state: state,
        pincode: pincode,
        location: profile?.location || user.location || null,

        // Account Info
        isAdminVerified: user.isAdminVerified !== false,
        status: user.isAdminVerified !== false ? 'active' : 'blocked',
        createdAt: user.createdAt,
        lastActive: lastActive,
        lastLogin: user.lastLogin,

        // Statistics
        rating: rating,
        totalRides: totalBookings,
        totalSpent: totalSpent,
        completedRides: completedRides,
        cancelledRides: cancelledRides,
        totalBookings: totalBookings,
        walletBalance: walletBalance,

        // Referral Info
        referralCode: referralCode,
        referrals: referrals,

        // History
        rides: formattedRides,
        payments: formattedPayments,

        // Additional Info
        isVerified: profile?.isVerified !== false,
        profileCompleted: profile ? true : false
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// @desc    Update user status (block/unblock)
exports.updateUserStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;

    await User.findByIdAndUpdate(req.params.id, { isAdminVerified: status === 'active' });

    // Also update customer profile if needed
    await CustomerProfile.findOneAndUpdate(
      { userId: req.params.id },
      { isVerified: status === 'active' },
      { upsert: false }
    );

    // Send notification to user about status change
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        toUserId: req.params.id,
        fromUserId: req.admin?._id || req.params.id,
        title: status === 'active' ? 'Account Activated' : 'Account Blocked',
        body: status === 'active'
          ? 'Your account has been activated. You can now use all features.'
          : `Your account has been blocked. Reason: ${reason || 'Contact support for more information.'}`,
        type: status === 'active' ? 'success' : 'error',
        extra: { action: status === 'active' ? 'unblocked' : 'blocked', reason: reason }
      });
    } catch (err) {
      console.log('Notification error:', err.message);
    }

    res.json({ success: true, message: `User ${status === 'active' ? 'activated' : 'blocked'} successfully` });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all drivers
exports.getDrivers = async (req, res) => {
  try {
    const cabDrivers = await CabDriverProfile.find()
      .populate('userId', 'name phone email')
      .lean();
    const goodsDrivers = await GoodsDriverProfile.find()
      .populate('userId', 'name phone email')
      .lean();

    const drivers = [...cabDrivers, ...goodsDrivers];

    // Format drivers to include phone from populated userId
    const formattedDrivers = drivers.map(driver => ({
      ...driver,
      phone: driver.userId?.phone || 'N/A',
      email: driver.userId?.email || 'N/A',
      name: driver.userId?.name || driver.fullName || 'N/A'
    }));

    res.json({ success: true, drivers: formattedDrivers });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single driver
exports.getDriverById = async (req, res) => {
  try {
    let driver = await CabDriverProfile.findOne({ userId: req.params.id }).lean();
    if (!driver) driver = await GoodsDriverProfile.findOne({ userId: req.params.id }).lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const user = await User.findById(driver.userId).lean();
    const wallet = await Wallet.findOne({ driverId: driver.userId }).lean();
    const rides = await Ride.find({ driverId: driver.userId }).sort({ createdAt: -1 }).limit(10).lean();
    
    const reviews = await Review.find({ revieweeId: driver.userId })
      .populate('reviewerId', 'name phone')
      .populate('rideId', 'fromCity toCity price pricePerSeat createdAt status')
      .sort({ createdAt: -1 })
      .lean();
      
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        ...driver,
        phone: user?.phone,
        email: user?.email,
        walletBalance: wallet?.balance || 0,
        averageRating: Number(averageRating),
        totalReviews,
        reviews: reviews.map(r => ({
          _id: r._id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          reviewer: r.reviewerId ? { name: r.reviewerId.name, phone: r.reviewerId.phone } : null,
          ride: r.rideId ? {
            from: r.rideId.fromCity,
            to: r.rideId.toCity,
            fare: r.rideId.price || r.rideId.pricePerSeat || 0,
            date: r.rideId.createdAt,
            status: r.rideId.status
          } : null
        })),
        rides: rides.map(r => ({
          id: r._id,
          from: r.fromCity,
          to: r.toCity,
          date: r.createdAt,
          fare: r.price || r.pricePerSeat || 0,
          status: r.status
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Verify driver (approve/reject/unapprove)
exports.verifyDriver = async (req, res) => {
  try {
    const { status, reason } = req.body;
    let driver = await CabDriverProfile.findOne({ userId: req.params.id });
    if (!driver) driver = await GoodsDriverProfile.findOne({ userId: req.params.id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    driver.status = status;
    if (status === 'approved') driver.onboardingCompleted = true;
    if (status === 'pending') driver.onboardingCompleted = false;
    await driver.save();

    const user = await User.findById(driver.userId);
    if (user) user.isAdminVerified = status === 'approved';
    await user?.save();

    // Send notification to driver
    await Notification.create({
      toUserId: driver.userId,
      fromUserId: req.admin._id,
      title: status === 'approved' ? '✅ Driver Approved' : status === 'pending' ? '🔄 Driver Unapproved' : '❌ Driver Rejected',
      body: status === 'approved' ? 'Your driver profile has been approved!' :
        status === 'pending' ? 'Your driver profile has been unapproved and is pending review.' :
          `Your driver application has been rejected. Reason: ${reason || 'Contact support'}`,
      extra: { type: 'driver_verification', status: status }
    });

    res.json({ success: true, message: `Driver ${status === 'approved' ? 'approved' : status === 'pending' ? 'unapproved' : 'rejected'}` });
  } catch (error) {
    console.error('Verify driver error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all rides
exports.getRides = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;
    const query = {};
    if (type && type !== 'all') query.role = type === 'cab' ? 'cab_ride' : 'goods_ride';
    if (status && status !== 'all') query.status = status;
    const rides = await Ride.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).populate('customerId', 'name phone').populate('driverId', 'name phone').populate('bookedPassengers', 'name phone').lean();
    const total = await Ride.countDocuments(query);
    res.json({ success: true, rides, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Cancel ride by admin
exports.adminCancelRide = async (req, res) => {
  try {
    const { reason } = req.body;
    await Ride.findByIdAndUpdate(req.params.id, { status: 'cancelled', cancelReason: reason || 'Cancelled by admin' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



// @desc    General settings
exports.getSettings = async (req, res) => {
  res.json({
    success: true,
    appName: 'Dump & Drop',
    supportEmail: 'support@dumpdrop.com',
    supportPhone: '+91 98765 43210',
    address: 'Ahmedabad, Gujarat, India',
    currency: 'INR',
    taxRate: 18,
    minRideFare: 50,
    maxDistanceKm: 100,
    cancellationTimeLimit: 10,
    enablePromoCodes: true,
    enableReferrals: true,
    enableSMSNotifications: true,
    enableEmailNotifications: true,
  });
};

// @desc    Update settings
exports.updateSettings = async (req, res) => {
  res.json({ success: true });
};

// ============ DRIVER VERIFICATION FUNCTIONS ============

// @desc    Get pending driver verifications
exports.getPendingVerifications = async (req, res) => {
  try {
    const pendingCab = await CabDriverProfile.find({ status: 'pending' }).populate('userId', 'name phone email');
    const pendingGoods = await GoodsDriverProfile.find({ status: 'pending' }).populate('userId', 'name phone email');
    res.json({
      success: true,
      data: {
        cab: pendingCab,
        goods: pendingGoods,
        total: pendingCab.length + pendingGoods.length
      }
    });
  } catch (error) {
    console.error('Get pending verifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get verification details
exports.getVerificationDetails = async (req, res) => {
  try {
    const { id } = req.params;
    let driver = await CabDriverProfile.findOne({ userId: id }).lean();
    let driverType = 'cab';
    if (!driver) {
      driver = await GoodsDriverProfile.findOne({ userId: id }).lean();
      driverType = 'goods';
    }
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    const user = await User.findById(id).lean();
    res.json({
      success: true,
      data: {
        ...driver,
        driverType,
        phone: user?.phone,
        email: user?.email,
      }
    });
  } catch (error) {
    console.error('Get verification details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Approve verification
exports.approveVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverType } = req.body;

    let profile;
    if (driverType === 'cab') {
      profile = await CabDriverProfile.findOne({ userId: id });
    } else {
      profile = await GoodsDriverProfile.findOne({ userId: id });
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    profile.status = 'approved';
    await profile.save();
    await User.findByIdAndUpdate(id, { isAdminVerified: true });

    await Notification.create({
      toUserId: id,
      fromUserId: req.admin._id,
      title: '✅ Driver Approved',
      body: `Your ${driverType === 'cab' ? 'Cab Driver' : 'Goods Driver'} profile has been approved!`,
      extra: { type: 'driver_verification', status: 'approved', driverType }
    });

    res.json({ success: true, message: 'Driver approved successfully' });
  } catch (error) {
    console.error('Approve verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Reject verification
exports.rejectVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverType, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    let profile;
    if (driverType === 'cab') {
      profile = await CabDriverProfile.findOne({ userId: id });
    } else {
      profile = await GoodsDriverProfile.findOne({ userId: id });
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    profile.status = 'rejected';
    await profile.save();

    await Notification.create({
      toUserId: id,
      fromUserId: req.admin._id,
      title: '❌ Driver Rejected',
      body: `Your ${driverType === 'cab' ? 'Cab Driver' : 'Goods Driver'} application has been rejected. Reason: ${reason}`,
      extra: { type: 'driver_verification', status: 'rejected', reason, driverType }
    });

    res.json({ success: true, message: 'Driver rejected' });
  } catch (error) {
    console.error('Reject verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all notifications
// @route   GET /api/admin/notifications
// @access  Private (Admin)
exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', isRead = 'all' } = req.query;

    let query = {};
    if (type !== 'all') query.type = type;
    if (isRead !== 'all') query.isRead = isRead === 'true';

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('toUserId', 'name phone')
      .populate('fromUserId', 'name phone')
      .populate('relatedRideId', 'fromCity toCity fare status')
      .populate('relatedDriverId', 'name phone')
      .populate('relatedCustomerId', 'name phone');

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ isRead: false });

    res.json({
      success: true,
      notifications,
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/admin/notifications/:id/read
// @access  Private (Admin)
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/admin/notifications/read-all
// @access  Private (Admin)
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete notification
// @route   DELETE /api/admin/notifications/:id
// @access  Private (Admin)
exports.deleteNotification = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Send notification to users
// @route   POST /api/admin/notifications/send
// @access  Private (Admin)
exports.sendNotification = async (req, res) => {
  try {
    const { title, body, type, targetAudience, userIds, driverType } = req.body;

    let targetUsers = [];

    if (targetAudience === 'all') {
      targetUsers = await User.find({}, '_id');
    } else if (targetAudience === 'customers') {
      targetUsers = await User.find({ role: 'customer' }, '_id');
    } else if (targetAudience === 'drivers') {
      let driverRole = [];
      if (driverType === 'cab') driverRole = ['cab_driver'];
      else if (driverType === 'goods') driverRole = ['goods_driver'];
      else driverRole = ['cab_driver', 'goods_driver'];
      targetUsers = await User.find({ role: { $in: driverRole } }, '_id');
    } else if (targetAudience === 'specific' && userIds) {
      targetUsers = userIds.map(id => ({ _id: id }));
    }

    const notifications = [];
    for (const user of targetUsers) {
      notifications.push({
        toUserId: user._id,
        fromUserId: req.admin._id,
        title,
        body,
        type: type || 'info',
        extra: { sentBy: req.admin.name, sentAt: new Date() }
      });
    }

    await Notification.insertMany(notifications);

    res.json({
      success: true,
      message: `Notification sent to ${notifications.length} users`,
      count: notifications.length
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get notification stats
// @route   GET /api/admin/notifications/stats
// @access  Private (Admin)
exports.getNotificationStats = async (req, res) => {
  try {
    const total = await Notification.countDocuments();
    const unread = await Notification.countDocuments({ isRead: false });
    const read = total - unread;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await Notification.countDocuments({ createdAt: { $gte: today } });

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekCount = await Notification.countDocuments({ createdAt: { $gte: thisWeek } });

    const byType = await Notification.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      stats: {
        total,
        unread,
        read,
        today: todayCount,
        thisWeek: weekCount,
        byType
      }
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// Get commission settings
exports.getCommissionSettings = async (req, res) => {
  try {
    let settings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    if (!settings) {
      settings = await CommissionSettings.create({ driverCommission: 80 });
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update commission settings
exports.updateCommissionSettings = async (req, res) => {
  try {
    const { driverCommission } = req.body;
    console.log("Updating commission to:", driverCommission);
    let settings = await CommissionSettings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      settings = new CommissionSettings();
    }

    settings.driverCommission = driverCommission !== undefined ? Number(driverCommission) : 80;
    if (req.admin && req.admin._id) {
      settings.updatedBy = req.admin._id;
    }
    
    await settings.save();
    console.log("Commission saved successfully:", settings);

    res.json({ success: true, message: 'Commission updated successfully', data: settings });
  } catch (error) {
    console.error("Update commission error:", error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Get only driver commission value
exports.getDriverCommission = async (req, res) => {
  try {
    let settings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    const commission = (settings && settings.driverCommission !== undefined) ? settings.driverCommission : 80;
    res.json({ success: true, commission });
  } catch (error) {
    console.error("Get commission error:", error);
    res.json({ success: true, commission: 80 });
  }
};
exports.getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', status = 'all', startDate, endDate, search } = req.query;

    let query = {};

    // Filter by payment status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get payments with ride details
    let paymentsQuery = Payment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('customerId', 'name phone')
      .populate('driverId', 'name phone')
      .populate('rideId', 'fromCity toCity fare status role');

    // Apply search filter
    if (search) {
      const customers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const drivers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const customerIds = customers.map(c => c._id);
      const driverIds = drivers.map(d => d._id);

      paymentsQuery = paymentsQuery.or([
        { customerId: { $in: customerIds } },
        { driverId: { $in: driverIds } },
        { razorpayOrderId: { $regex: search, $options: 'i' } },
        { razorpayPaymentId: { $regex: search, $options: 'i' } }
      ]);
    }

    const payments = await paymentsQuery;
    const total = await Payment.countDocuments(query);

    // Apply ride type filter after population
    let filteredPayments = payments;
    if (type !== 'all') {
      filteredPayments = payments.filter(p => p.rideId && p.rideId.role === (type === 'cab' ? 'cab_ride' : 'goods_ride'));
    }

    // Get common commission settings (SINGLE COMMISSION FOR BOTH)
    const commissionSettings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    const driverCommission = commissionSettings?.driverCommission || 80;  // SINGLE COMMISSION

    const paymentsWithDetails = filteredPayments.map(payment => {
      const rideType = payment.rideId?.role === 'cab_ride' ? 'cab' : 'goods';

      // Calculate driver payout (driver gets commission% of amount)
      const driverPayout = (payment.amount * driverCommission) / 100;

      return {
        _id: payment._id,
        orderId: payment.razorpayOrderId || `ORD${payment._id.toString().slice(-8)}`,
        rideType,
        driverId: payment.driverId,
        driver: payment.driverId ? {
          name: payment.driverId.name,
          phone: payment.driverId.phone
        } : { name: 'N/A', phone: 'N/A' },
        customerId: payment.customerId,
        customer: payment.customerId ? {
          name: payment.customerId.name,
          phone: payment.customerId.phone
        } : { name: 'N/A', phone: 'N/A' },
        amount: payment.amount,
        commission: driverCommission,  // Just the percentage
        payout: Math.round(driverPayout * 100) / 100,
        status: payment.status,
        paymentMode: payment.razorpayPaymentId ? 'online' : 'cash',
        transactionId: payment.razorpayPaymentId || payment.razorpayOrderId || 'N/A',
        rideFrom: payment.rideId?.fromCity || 'N/A',
        rideTo: payment.rideId?.toCity || 'N/A',
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      };
    });

    // Calculate stats (removed totalCommission)
    const stats = {
      totalRevenue: paymentsWithDetails.reduce((sum, p) => sum + p.amount, 0),
      totalPayout: paymentsWithDetails.reduce((sum, p) => sum + p.payout, 0),
      pendingCount: paymentsWithDetails.filter(p => p.status === 'pending').length,
      completedCount: paymentsWithDetails.filter(p => p.status === 'paid').length,
      failedCount: paymentsWithDetails.filter(p => p.status === 'failed').length
    };

    res.json({
      success: true,
      payments: paymentsWithDetails,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats,
      commissionSettings: {
        driverCommission: driverCommission  // Only commission, no GST
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get payment by ID
// @route   GET /api/admin/payments/:id
// @access  Private (Admin)
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('customerId', 'name phone email')
      .populate('driverId', 'name phone email')
      .populate('rideId', 'fromCity toCity fare status role distance duration');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Get common commission settings
    const commissionSettings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    const driverCommission = commissionSettings?.driverCommission || 80;

    const driverPayout = (payment.amount * driverCommission) / 100;

    res.json({
      success: true,
      payment: {
        _id: payment._id,
        orderId: payment.razorpayOrderId || `ORD${payment._id.toString().slice(-8)}`,
        rideType: payment.rideId?.role === 'cab_ride' ? 'cab' : 'goods',
        driver: payment.driverId ? {
          name: payment.driverId.name,
          phone: payment.driverId.phone,
          email: payment.driverId.email
        } : { name: 'N/A', phone: 'N/A' },
        customer: payment.customerId ? {
          name: payment.customerId.name,
          phone: payment.customerId.phone,
          email: payment.customerId.email
        } : { name: 'N/A', phone: 'N/A' },
        amount: payment.amount,
        commission: driverCommission,
        payout: Math.round(driverPayout * 100) / 100,
        status: payment.status,
        paymentMode: payment.razorpayPaymentId ? 'online' : 'cash',
        transactionId: payment.razorpayPaymentId || payment.razorpayOrderId || 'N/A',
        rideFrom: payment.rideId?.fromCity || 'N/A',
        rideTo: payment.rideId?.toCity || 'N/A',
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        notes: payment.notes
      }
    });
  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update payment status
// @route   PUT /api/admin/payments/:id/status
// @access  Private (Admin)
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status, transactionId } = req.body;

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      {
        status,
        razorpayPaymentId: transactionId,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Update ride payment status
    if (payment.rideId) {
      await Ride.findByIdAndUpdate(payment.rideId, { paymentStatus: status === 'paid' ? 'completed' : status });
    }

    res.json({ success: true, payment });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get transaction history
// @route   GET /api/admin/transactions
// @access  Private (Admin)
exports.getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, category } = req.query;

    let query = {};
    if (type) query.type = type;
    if (category) query.category = category;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('driverId', 'name phone')
      .populate('rideId', 'fromCity toCity fare');

    const total = await Transaction.countDocuments(query);

    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
          totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } },
          totalPayout: { $sum: { $cond: [{ $eq: ['$category', 'online_payment'] }, '$amount', 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats: stats[0] || {
        totalCredit: 0,
        totalDebit: 0,
        totalPayout: 0
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// @desc    Get all payouts
// @route   GET /api/admin/payouts
// @access  Private (Admin)
exports.getPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all', driverId, startDate, endDate, search } = req.query;

    let query = {};

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by driver
    if (driverId) {
      query.driverId = driverId;
    }

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all wallet transactions that are CREDIT (payouts)
    let transactionsQuery = Transaction.find({
      type: 'CREDIT',
      category: 'online_payment'
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('driverId', 'name phone email')
      .populate('rideId', 'fromCity toCity fare');

    // Apply search filter
    if (search) {
      const drivers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const driverIds = drivers.map(d => d._id);
      transactionsQuery = transactionsQuery.where('driverId').in(driverIds);
    }

    const transactions = await transactionsQuery;
    const total = await Transaction.countDocuments({ type: 'CREDIT', category: 'online_payment' });

    // Get all drivers for filter dropdown
    const drivers = await User.find(
      { role: { $in: ['cab_driver', 'goods_driver'] } },
      'name phone email'
    );

    // Calculate stats
    const stats = await Transaction.aggregate([
      { $match: { type: 'CREDIT', category: 'online_payment' } },
      {
        $group: {
          _id: null,
          totalPayout: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          avgPayout: { $avg: '$amount' }
        }
      }
    ]);

    // Get pending payouts (transactions with status pending)
    const pendingPayouts = await Transaction.countDocuments({
      type: 'CREDIT',
      category: 'online_payment',
      status: 'pending'
    });

    // Get completed payouts
    const completedPayouts = await Transaction.countDocuments({
      type: 'CREDIT',
      category: 'online_payment',
      status: 'completed'
    });

    // Format payouts
    const payouts = transactions.map(t => ({
      _id: t._id,
      payoutId: `POUT${t._id.toString().slice(-8)}`,
      driver: t.driverId ? {
        id: t.driverId._id,
        name: t.driverId.name,
        phone: t.driverId.phone,
        email: t.driverId.email
      } : null,
      amount: t.amount,
      status: t.status || 'completed',
      rideId: t.rideId,
      rideDetails: t.rideId ? {
        from: t.rideId.fromCity,
        to: t.rideId.toCity,
        fare: t.rideId.fare
      } : null,
      description: t.description || `Payout for ride ${t.rideId?._id?.slice(-8) || 'N/A'}`,
      paymentMode: 'bank_transfer',
      transactionId: t._id.toString(),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }));

    res.json({
      success: true,
      payouts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats: {
        totalPayout: stats[0]?.totalPayout || 0,
        totalCount: stats[0]?.totalCount || 0,
        avgPayout: stats[0]?.avgPayout || 0,
        pendingCount: pendingPayouts,
        completedCount: completedPayouts
      },
      drivers
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get driver wallet details
// @route   GET /api/admin/payouts/drivers/:driverId/wallet
// @access  Private (Admin)
exports.getDriverWallet = async (req, res) => {
  try {
    const { driverId } = req.params;

    const wallet = await Wallet.findOne({ driverId });
    const transactions = await Transaction.find({ driverId })
      .sort({ createdAt: -1 })
      .limit(50);

    // Calculate earnings summary
    const earnings = await Transaction.aggregate([
      { $match: { driverId: mongoose.Types.ObjectId(driverId) } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalEarnings = earnings.find(e => e._id === 'CREDIT')?.total || 0;
    const totalDues = earnings.find(e => e._id === 'DEBIT')?.total || 0;

    res.json({
      success: true,
      wallet: wallet || { balance: 0, currency: 'INR' },
      transactions,
      stats: {
        totalEarnings,
        totalDues,
        netBalance: totalEarnings - totalDues
      }
    });
  } catch (error) {
    console.error('Get driver wallet error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Process payout (mark as completed)
// @route   PUT /api/admin/payouts/:id/process
// @access  Private (Admin)
exports.processPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId, notes } = req.body;

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      {
        status: 'completed',
        description: notes || transaction.description,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Payout not found' });
    }

    res.json({
      success: true,
      message: 'Payout processed successfully',
      payout: transaction
    });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create manual payout for driver
// @route   POST /api/admin/payouts/create
// @access  Private (Admin)
exports.createPayout = async (req, res) => {
  try {
    const { driverId, amount, description, paymentMode } = req.body;

    // Get driver wallet
    let wallet = await Wallet.findOne({ driverId });
    if (!wallet) {
      wallet = await Wallet.create({ driverId, balance: 0 });
    }

    // Create transaction
    const transaction = await Transaction.create({
      walletId: wallet._id,
      driverId,
      amount,
      type: 'DEBIT',
      category: 'withdrawal',
      status: 'pending',
      description: description || 'Manual payout withdrawal'
    });

    // Update wallet balance
    wallet.balance -= amount;
    await wallet.save();

    res.json({
      success: true,
      message: 'Payout created successfully',
      payout: transaction
    });
  } catch (error) {
    console.error('Create payout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get payout summary
// @route   GET /api/admin/payouts/summary
// @access  Private (Admin)
exports.getPayoutSummary = async (req, res) => {
  try {
    // Get current month stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Monthly stats
    const monthlyStats = await Transaction.aggregate([
      {
        $match: {
          type: 'CREDIT',
          category: 'online_payment',
          createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Weekly stats
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyStats = await Transaction.aggregate([
      {
        $match: {
          type: 'CREDIT',
          category: 'online_payment',
          createdAt: { $gte: startOfWeek }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Top earning drivers
    const topDrivers = await Transaction.aggregate([
      { $match: { type: 'CREDIT', category: 'online_payment' } },
      {
        $group: {
          _id: '$driverId',
          totalEarnings: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'driver' } },
      { $unwind: '$driver' }
    ]);

    res.json({
      success: true,
      summary: {
        monthly: {
          total: monthlyStats[0]?.total || 0,
          count: monthlyStats[0]?.count || 0
        },
        weekly: {
          total: weeklyStats[0]?.total || 0,
          count: weeklyStats[0]?.count || 0
        },
        topDrivers: topDrivers.map(d => ({
          driverId: d._id,
          driverName: d.driver.name,
          driverPhone: d.driver.phone,
          totalEarnings: d.totalEarnings,
          payoutCount: d.count
        }))
      }
    });
  } catch (error) {
    console.error('Get payout summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// In adminController.js - Replace your existing getAllBookings function with this

exports.getAllBookings = async (req, res) => {
  try {
    const { page = 1, limit = 1000, type = 'all', status = 'all', startDate, endDate, search } = req.query;

    let query = {};

    // Filter by ride type
    if (type !== 'all') {
      query.role = type === 'cab' ? 'cab_ride' : 'goods_ride';
    }

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Search
    if (search) {
      const customers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const drivers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const customerIds = customers.map(c => c._id);
      const driverIds = drivers.map(d => d._id);

      query.$or = [
        { customerId: { $in: customerIds } },
        { driverId: { $in: driverIds } },
        { _id: { $regex: search, $options: 'i' } }
      ];
    }

    const bookings = await Ride.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('customerId', 'name phone email')
      .populate('driverId', 'name phone email')
      .populate('bookedPassengers', 'name phone');

    const total = await Ride.countDocuments(query);

    // Get ALL rentals from Rental collection
    const Rental = require('../models/Rental');

    // Create a map of rental details by customerId
    let rentalMap = new Map(); // customerId -> { startDate, endDate, totalPrice }

    try {
      const allRentals = await Rental.find({});
      console.log(`Found ${allRentals.length} rentals in database`);

      allRentals.forEach(rental => {
        if (rental.customerId) {
          const customerIdStr = rental.customerId.toString();
          // Store rental dates for this customer
          if (!rentalMap.has(customerIdStr)) {
            rentalMap.set(customerIdStr, {
              startDate: rental.startDate,
              endDate: rental.endDate,
              totalPrice: rental.totalPrice || rental.cost || 0
            });
          }
        }
      });

      console.log('Rental Map size:', rentalMap.size);
    } catch (err) {
      console.log('Error fetching rentals:', err.message);
    }

    // Calculate stats
    const stats = await Ride.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          searching: { $sum: { $cond: [{ $eq: ['$status', 'searching'] }, 1, 0] } },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
          ongoing: { $sum: { $cond: [{ $eq: ['$status', 'ongoing'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }
      }
    ]);

    const formattedBookings = bookings.map(booking => {
      // Get passenger details
      let passengerDetails = [];
      let processedIds = new Set();

      if (booking.bookedPassengers && booking.bookedPassengers.length > 0) {
        booking.bookedPassengers.forEach(p => {
          if (p && p._id && !processedIds.has(p._id.toString())) {
            processedIds.add(p._id.toString());
            passengerDetails.push({
              name: p.name || 'N/A',
              phone: p.phone || 'N/A',
              route: 'N/A'
            });
          }
        });
      }

      if (booking.bookings && booking.bookings.length > 0) {
        booking.bookings.forEach(b => {
          if (b.customerId && !processedIds.has(b.customerId.toString())) {
            processedIds.add(b.customerId.toString());
            passengerDetails.push({
              name: b.customerName || 'N/A',
              phone: b.customerPhone || 'N/A',
              route: 'N/A'
            });
          } else if (b.customerName && !passengerDetails.some(p => p.name === b.customerName)) {
            passengerDetails.push({
              name: b.customerName,
              phone: b.customerPhone || 'N/A',
              route: 'N/A'
            });
          }
        });
      }

      if (booking.customerId && !processedIds.has(booking.customerId._id.toString())) {
        passengerDetails.unshift({
          name: booking.customerId.name || 'N/A',
          phone: booking.customerId.phone || 'N/A',
          route: 'N/A'
        });
      }

      // Get routes
      let mainRoute = 'N/A';
      if (booking.segments && booking.segments.length > 0) {
        const firstSegment = booking.segments[0];
        const lastSegment = booking.segments[booking.segments.length - 1];
        if (firstSegment?.fromCity && lastSegment?.toCity) {
          mainRoute = `${firstSegment.fromCity} → ${lastSegment.toCity}`;
        }
      } else if (booking.fromCity && booking.toCity) {
        mainRoute = `${booking.fromCity} → ${booking.toCity}`;
      }

      if (booking.bookings && booking.bookings.length > 0) {
        passengerDetails = passengerDetails.map(passenger => {
          const passengerBooking = booking.bookings.find(b =>
            b.customerName === passenger.name || b.customerId?.toString() === passenger._id
          );
          if (passengerBooking && passengerBooking.fromCity && passengerBooking.toCity) {
            return {
              ...passenger,
              route: `${passengerBooking.fromCity} → ${passengerBooking.toCity}`
            };
          }
          return passenger;
        });
      }

      // Get regular amount
      let amount = booking.price || booking.pricePerSeat || 0;
      if (booking.bookings && booking.bookings.length > 0 && booking.bookings[0].pricing?.customerAmount) {
        amount = Math.round(booking.bookings[0].pricing.customerAmount);
      }

      // Check if this is a rental booking
      let isRental = false;
      let rentalStartDate = null;
      let rentalEndDate = null;
      let rentalAmount = 0;

      // If amount is 0, this is likely a rental booking
      if (amount === 0 && booking.customerId) {
        const customerIdStr = booking.customerId._id.toString();
        if (rentalMap.has(customerIdStr)) {
          const rentalData = rentalMap.get(customerIdStr);
          isRental = true;
          rentalStartDate = rentalData.startDate;
          rentalEndDate = rentalData.endDate;
          rentalAmount = rentalData.totalPrice; // ADD THIS - the actual rental amount
        }
      }

      return {
        _id: booking._id,
        rideType: booking.role === 'cab_ride' ? 'cab' : 'goods',
        customer: booking.customerId ? {
          name: booking.customerId.name,
          phone: booking.customerId.phone,
          email: booking.customerId.email
        } : (booking.customerName ? {
          name: booking.customerName,
          phone: booking.customerPhone || 'N/A'
        } : (booking.bookings && booking.bookings.length > 0 && booking.bookings[0].customerName ? {
          name: booking.bookings[0].customerName,
          phone: booking.bookings[0].customerPhone || 'N/A'
        } : null)),
        driver: booking.driverId ? {
          name: booking.driverId.name,
          phone: booking.driverId.phone,
          email: booking.driverId.email
        } : null,
        fromCity: booking.fromCity || booking.pickupLocation?.address,
        toCity: booking.toCity || booking.dropLocation?.address,
        amount: amount,
        rentalAmount: rentalAmount, // ADD THIS FIELD
        status: booking.status,
        createdAt: booking.createdAt,
        passengerDetails: passengerDetails,
        mainRoute: mainRoute,
        isRental: isRental,
        startDate: rentalStartDate,
        endDate: rentalEndDate
      };
    });

    // Calculate totals - including rental amounts for correct total
    const totalAmount = formattedBookings.reduce((sum, b) => {
      // For rentals, use rentalAmount, otherwise use amount
      const displayAmount = b.isRental ? (b.rentalAmount || 0) : (b.amount || 0);
      return sum + displayAmount;
    }, 0);

    console.log('=== FINAL STATS ===');
    console.log('Total Bookings:', formattedBookings.length);
    console.log('Total Amount (with rentals):', totalAmount);
    console.log('Rental Bookings:', formattedBookings.filter(b => b.isRental).length);
    console.log('==================');

    res.json({
      success: true,
      bookings: formattedBookings,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats: {
        total: stats[0]?.total || 0,
        searching: stats[0]?.searching || 0,
        available: stats[0]?.available || 0,
        accepted: stats[0]?.accepted || 0,
        ongoing: stats[0]?.ongoing || 0,
        completed: stats[0]?.completed || 0,
        cancelled: stats[0]?.cancelled || 0,
        totalAmount: totalAmount
      }
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
// @desc    Cancel booking by admin
// @route   PUT /api/admin/bookings/:id/cancel
// @access  Private (Admin)
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a reason for cancellation' 
      });
    }

    const booking = await Ride.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Update all fields
    booking.status = 'cancelled';
    booking.cancelReason = reason;
    booking.cancelledBy = 'admin';
    booking.cancelledAt = new Date();
    
    await booking.save();

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully' 
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
};
// @desc    Export bookings to CSV
// @route   GET /api/admin/bookings/export
// @access  Private (Admin)
exports.exportBookings = async (req, res) => {
  try {
    const { type = 'all', status = 'all', startDate, endDate, search } = req.query;

    let query = {};

    if (type !== 'all') {
      query.role = type === 'cab' ? 'cab_ride' : 'goods_ride';
    }
    if (status !== 'all') {
      query.status = status;
    }
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const bookings = await Ride.find(query)
      .populate('customerId', 'name phone')
      .populate('driverId', 'name phone');

    const csvData = bookings.map(b => ({
      'Booking ID': b._id,
      'Type': b.role === 'cab_ride' ? 'Cab Ride' : 'Goods Delivery',
      'Customer Name': b.customerId?.name || 'N/A',
      'Customer Phone': b.customerId?.phone || 'N/A',
      'Driver Name': b.driverId?.name || 'N/A',
      'Driver Phone': b.driverId?.phone || 'N/A',
      'From': b.fromCity || 'N/A',
      'To': b.toCity || 'N/A',
      'Amount': b.price || 0,
      'Status': b.status,
      'Date': new Date(b.createdAt).toLocaleString()
    }));

    const headers = Object.keys(csvData[0] || {});
    const csvRows = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
    ];
    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bookings_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// In adminController.js - Complete fixed getRevenueReports function

exports.getRevenueReports = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    console.log(`Fetching revenue reports for period: ${period}`);

    let startDate;
    const now = new Date();
    let labels = [];

    // Set date range based on period
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
    } else if (period === 'quarter') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      startDate.setHours(0, 0, 0, 0);
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8', 'Week 9', 'Week 10', 'Week 11', 'Week 12'];
    } else { // year
      startDate = new Date(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    // Get ALL completed rides
    const rides = await Ride.find({
      createdAt: { $gte: startDate, $lte: now },
      status: 'completed'
    }).lean();

    console.log(`Found ${rides.length} completed rides`);

    // Helper function to get ride amount from multiple fields
    const getRideAmount = (ride) => {
      if (ride.price && ride.price > 0) return ride.price;
      if (ride.fare && ride.fare > 0) return ride.fare;
      if (ride.amount && ride.amount > 0) return ride.amount;
      if (ride.pricePerSeat && ride.pricePerSeat > 0) return ride.pricePerSeat;
      if (ride.totalPrice && ride.totalPrice > 0) return ride.totalPrice;
      
      // Check bookings array
      if (ride.bookings && ride.bookings.length > 0) {
        let total = 0;
        for (const booking of ride.bookings) {
          if (booking.pricing?.customerAmount) {
            total += booking.pricing.customerAmount;
          } else if (booking.price) {
            total += booking.price;
          } else if (booking.amount) {
            total += booking.amount;
          }
        }
        if (total > 0) return total;
      }
      
      return 0;
    };

    // Helper function to get ride type - CHECK ALL POSSIBLE FIELDS
    const getRideType = (ride) => {
      // Check role field (most common)
      if (ride.role === 'cab_ride') return 'cab';
      if (ride.role === 'goods_ride') return 'goods';
      if (ride.role === 'cab') return 'cab';
      if (ride.role === 'goods') return 'goods';
      
      // Check rideType field
      if (ride.rideType === 'cab') return 'cab';
      if (ride.rideType === 'goods') return 'goods';
      
      // Check type field
      if (ride.type === 'cab') return 'cab';
      if (ride.type === 'goods') return 'goods';
      
      // Check vehicleType for goods
      if (ride.vehicleType) {
        const goodsTypes = ['truck', 'container', 'pickup', 'goods', 'lorry', 'trailer', 'multi axle'];
        if (goodsTypes.some(type => ride.vehicleType.toLowerCase().includes(type))) {
          return 'goods';
        }
      }
      
      return 'unknown';
    };

    // Separate cab and goods rides
    let cabRidesArray = [];
    let goodsRidesArray = [];
    let unknownRides = [];

    for (const ride of rides) {
      const rideType = getRideType(ride);
      if (rideType === 'cab') {
        cabRidesArray.push(ride);
      } else if (rideType === 'goods') {
        goodsRidesArray.push(ride);
      } else {
        unknownRides.push(ride);
        // Log unknown rides for debugging
        console.log(`Unknown ride type: ${ride._id}, role: ${ride.role}, rideType: ${ride.rideType}, type: ${ride.type}`);
      }
    }

    // Calculate revenues
    let cabRevenue = 0;
    for (const ride of cabRidesArray) {
      cabRevenue += getRideAmount(ride);
    }
    
    let goodsRevenue = 0;
    for (const ride of goodsRidesArray) {
      goodsRevenue += getRideAmount(ride);
    }
    
    // Also check unknown rides - try to determine from other fields
    for (const ride of unknownRides) {
      const amount = getRideAmount(ride);
      // If it has a driver and fromCity/toCity, could be cab
      if (ride.driverId && ride.fromCity && ride.toCity) {
        cabRevenue += amount;
        cabRidesArray.push(ride);
      } else {
        goodsRevenue += amount;
        goodsRidesArray.push(ride);
      }
    }

    const totalRevenue = cabRevenue + goodsRevenue;
    const totalRides = cabRidesArray.length + goodsRidesArray.length;

    console.log(`=== REVENUE BREAKDOWN ===`);
    console.log(`Cab Rides: ${cabRidesArray.length} rides, Revenue: ${cabRevenue}`);
    console.log(`Goods Rides: ${goodsRidesArray.length} rides, Revenue: ${goodsRevenue}`);
    console.log(`Total Revenue: ${totalRevenue}`);
    console.log(`Total Rides: ${totalRides}`);
    console.log(`========================`);

    // Get commission settings
    let commissionSettings = await CommissionSettings.findOne().sort({ createdAt: -1 });
    let driverCommission = 80;

    if (commissionSettings) {
      driverCommission = commissionSettings.driverCommission;
      console.log(`Commission from database: ${driverCommission}%`);
    } else {
      const newSettings = await CommissionSettings.create({ driverCommission: 80 });
      driverCommission = newSettings.driverCommission;
      console.log('Created new commission settings with 80%');
    }

    const totalPayout = totalRevenue * (driverCommission / 100);
    const avgRevenuePerRide = totalRides > 0 ? totalRevenue / totalRides : 0;

    // Calculate growth
    let previousStartDate;
    let previousEndDate = startDate;

    if (period === 'week') {
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      previousStartDate = new Date(startDate);
      previousStartDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'quarter') {
      previousStartDate = new Date(startDate);
      previousStartDate.setMonth(startDate.getMonth() - 3);
    } else {
      previousStartDate = new Date(startDate);
      previousStartDate.setFullYear(startDate.getFullYear() - 1);
    }
    previousStartDate.setHours(0, 0, 0, 0);

    const previousRides = await Ride.find({
      createdAt: { $gte: previousStartDate, $lt: previousEndDate },
      status: 'completed'
    }).lean();

    let previousRevenue = 0;
    for (const ride of previousRides) {
      previousRevenue += getRideAmount(ride);
    }
    
    const growth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Group revenue by period for chart
    const revenueMap = new Map();

    // Process cab rides
    for (const ride of cabRidesArray) {
      let key;
      const rideDate = new Date(ride.createdAt);
      const rideAmount = getRideAmount(ride);

      if (period === 'week') {
        let dayIndex = rideDate.getDay();
        key = dayIndex === 0 ? 6 : dayIndex - 1;
      } else if (period === 'month') {
        key = rideDate.getDate() - 1;
      } else if (period === 'quarter') {
        const startOfYear = new Date(rideDate.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(((rideDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        key = weekNumber - 1;
      } else {
        key = rideDate.getMonth();
      }

      if (!revenueMap.has(key)) {
        revenueMap.set(key, { revenue: 0, rides: 0 });
      }
      const current = revenueMap.get(key);
      current.revenue += rideAmount;
      current.rides += 1;
      revenueMap.set(key, current);
    }

    // Process goods rides
    for (const ride of goodsRidesArray) {
      let key;
      const rideDate = new Date(ride.createdAt);
      const rideAmount = getRideAmount(ride);

      if (period === 'week') {
        let dayIndex = rideDate.getDay();
        key = dayIndex === 0 ? 6 : dayIndex - 1;
      } else if (period === 'month') {
        key = rideDate.getDate() - 1;
      } else if (period === 'quarter') {
        const startOfYear = new Date(rideDate.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(((rideDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        key = weekNumber - 1;
      } else {
        key = rideDate.getMonth();
      }

      if (!revenueMap.has(key)) {
        revenueMap.set(key, { revenue: 0, rides: 0 });
      }
      const current = revenueMap.get(key);
      current.revenue += rideAmount;
      current.rides += 1;
      revenueMap.set(key, current);
    }

    // Build revenue data array
    const revenueData = labels.map((label, index) => {
      const data = revenueMap.get(index) || { revenue: 0, rides: 0 };
      return {
        name: label,
        revenue: Math.round(data.revenue),
        payout: Math.round(data.revenue * (driverCommission / 100)),
        rides: data.rides
      };
    });

    // Prepare monthly data
    const monthlyData = revenueData.slice(0, 12);

    // Calculate percentages
    const totalServiceRevenue = cabRevenue + goodsRevenue;
    const cabPercentage = totalServiceRevenue > 0 ? (cabRevenue / totalServiceRevenue) * 100 : 0;
    const goodsPercentage = totalServiceRevenue > 0 ? (goodsRevenue / totalServiceRevenue) * 100 : 0;

    res.json({
      success: true,
      revenueData: revenueData,
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalPayout: Math.round(totalPayout),
        totalRides: totalRides,
        avgRevenuePerRide: Math.round(avgRevenuePerRide),
        driverCommission: driverCommission,
        growth: Math.round(growth * 10) / 10
      },
      breakdown: {
        cabRevenue: Math.round(cabRevenue),
        goodsRevenue: Math.round(goodsRevenue),
        cabPercentage: Math.round(cabPercentage * 10) / 10,
        goodsPercentage: Math.round(goodsPercentage * 10) / 10,
        cabRides: cabRidesArray.length,
        goodsRides: goodsRidesArray.length
      },
      monthlyData: monthlyData
    });
  } catch (error) {
    console.error('Get revenue reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
// @desc    Get cancelled rides
// @route   GET /api/admin/cancelled-rides
// @access  Private (Admin)
exports.getCancelledRides = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', reason = 'all', startDate, endDate, search } = req.query;

    let query = { status: 'cancelled' };

    if (type !== 'all') {
      query.role = type === 'cab' ? 'cab_ride' : 'goods_ride';
    }

    if (reason !== 'all') {
      query.cancelledBy = reason;
    }

    if (startDate && endDate) {
      query.cancelledAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (search) {
      const customers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      const drivers = await User.find({ name: { $regex: search, $options: 'i' } }, '_id');
      query.$or = [
        { customerId: { $in: customers.map(c => c._id) } },
        { driverId: { $in: drivers.map(d => d._id) } }
      ];
    }

    const rides = await Ride.find(query)
      .sort({ cancelledAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('customerId', 'name phone')
      .populate('driverId', 'name phone')
      .populate('bookedPassengers', 'name phone');

    const total = await Ride.countDocuments(query);

    // Get rentals for rental amount calculation
    const Rental = require('../models/Rental');
    let rentalMap = new Map();

    try {
      const allRentals = await Rental.find({});
      console.log(`Found ${allRentals.length} rentals in database`);
      
      allRentals.forEach(rental => {
        if (rental.customerId) {
          const customerIdStr = rental.customerId.toString();
          if (!rentalMap.has(customerIdStr)) {
            rentalMap.set(customerIdStr, {
              startDate: rental.startDate,
              endDate: rental.endDate,
              totalPrice: rental.totalPrice || rental.cost || 0
            });
          }
        }
      });
      console.log('Rental Map size:', rentalMap.size);
    } catch (err) {
      console.log('Error fetching rentals:', err.message);
    }

    // Calculate stats
    const stats = await Ride.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalAmount: { $sum: '$price' },
          byCustomer: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'customer'] }, 1, 0] } },
          byDriver: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'driver'] }, 1, 0] } },
          byAdmin: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'admin'] }, 1, 0] } }
        }
      }
    ]);

    const formattedRides = rides.map(ride => {
      // Get passenger details like getAllBookings
      let passengerDetails = [];
      let processedIds = new Set();

      if (ride.bookedPassengers && ride.bookedPassengers.length > 0) {
        ride.bookedPassengers.forEach(p => {
          if (p && p._id && !processedIds.has(p._id.toString())) {
            processedIds.add(p._id.toString());
            passengerDetails.push({
              name: p.name || 'N/A',
              phone: p.phone || 'N/A',
              route: 'N/A'
            });
          }
        });
      }

      if (ride.bookings && ride.bookings.length > 0) {
        ride.bookings.forEach(b => {
          if (b.customerId && !processedIds.has(b.customerId.toString())) {
            processedIds.add(b.customerId.toString());
            passengerDetails.push({
              name: b.customerName || 'N/A',
              phone: b.customerPhone || 'N/A',
              route: 'N/A'
            });
          } else if (b.customerName && !passengerDetails.some(p => p.name === b.customerName)) {
            passengerDetails.push({
              name: b.customerName,
              phone: b.customerPhone || 'N/A',
              route: 'N/A'
            });
          }
        });
      }

      // Get main customer
      let customerName = 'N/A';
      let customerPhone = 'N/A';
      if (ride.customerId && !processedIds.has(ride.customerId._id.toString())) {
        customerName = ride.customerId.name || 'N/A';
        customerPhone = ride.customerId.phone || 'N/A';
        passengerDetails.unshift({
          name: customerName,
          phone: customerPhone,
          route: 'N/A'
        });
      } else if (passengerDetails.length > 0) {
        customerName = passengerDetails[0].name;
        customerPhone = passengerDetails[0].phone;
      }

      // Get routes
      let routeFrom = ride.fromCity || ride.pickupLocation?.address || 'N/A';
      let routeTo = ride.toCity || ride.dropLocation?.address || 'N/A';
      let mainRoute = 'N/A';
      
      if (ride.segments && ride.segments.length > 0) {
        const firstSegment = ride.segments[0];
        const lastSegment = ride.segments[ride.segments.length - 1];
        if (firstSegment?.fromCity && lastSegment?.toCity) {
          mainRoute = `${firstSegment.fromCity} → ${lastSegment.toCity}`;
          routeFrom = firstSegment.fromCity;
          routeTo = lastSegment.toCity;
        }
      } else if (ride.fromCity && ride.toCity) {
        mainRoute = `${ride.fromCity} → ${ride.toCity}`;
      }

      // Get individual routes for passengers
      if (ride.bookings && ride.bookings.length > 0) {
        passengerDetails = passengerDetails.map(passenger => {
          const passengerBooking = ride.bookings.find(b =>
            b.customerName === passenger.name || b.customerId?.toString() === passenger._id
          );
          if (passengerBooking && passengerBooking.fromCity && passengerBooking.toCity) {
            return {
              ...passenger,
              route: `${passengerBooking.fromCity} → ${passengerBooking.toCity}`
            };
          }
          return passenger;
        });
      }

      // Get regular amount - SAME LOGIC AS getAllBookings
      let amount = ride.price || ride.pricePerSeat || 0;
      if (ride.bookings && ride.bookings.length > 0 && ride.bookings[0].pricing?.customerAmount) {
        amount = Math.round(ride.bookings[0].pricing.customerAmount);
      }

      // Check if this is a rental booking - SAME LOGIC AS getAllBookings
      let isRental = false;
      let rentalStartDate = null;
      let rentalEndDate = null;
      let rentalAmount = 0;

      if (amount === 0 && ride.customerId) {
        const customerIdStr = ride.customerId._id.toString();
        if (rentalMap.has(customerIdStr)) {
          const rentalData = rentalMap.get(customerIdStr);
          isRental = true;
          rentalStartDate = rentalData.startDate;
          rentalEndDate = rentalData.endDate;
          rentalAmount = rentalData.totalPrice;
        }
      }

      // Get cancelled by
      let cancelledByValue = ride.cancelledBy || 'admin';
      if (cancelledByValue === 'admin') cancelledByValue = 'admin';
      else if (cancelledByValue === 'driver') cancelledByValue = 'driver';
      else if (cancelledByValue === 'customer') cancelledByValue = 'customer';

      return {
        _id: ride._id,
        rideType: ride.role === 'cab_ride' ? 'cab' : 'goods',
        customer: {
          name: customerName,
          phone: customerPhone
        },
        driver: ride.driverId ? {
          name: ride.driverId.name || 'N/A',
          phone: ride.driverId.phone || 'N/A'
        } : null,
        fromCity: routeFrom,
        toCity: routeTo,
        amount: amount,  // Use the same amount logic as getAllBookings
        rentalAmount: rentalAmount,
        isRental: isRental,
        cancelledBy: cancelledByValue,
        cancelReason: ride.cancelReason || 'No reason provided',
        cancelledAt: ride.cancelledAt || ride.updatedAt,
        createdAt: ride.createdAt,
        passengerDetails: passengerDetails,
        mainRoute: mainRoute,
        startDate: rentalStartDate,
        endDate: rentalEndDate
      };
    });

    // Calculate total rental amount
    let totalRentalAmount = 0;
    for (const ride of formattedRides) {
      if (ride.isRental && ride.rentalAmount > 0) {
        totalRentalAmount += ride.rentalAmount;
      }
    }

    // Calculate total amount from rides (regular rides)
    const totalRegularAmount = formattedRides.reduce((sum, r) => sum + (r.isRental ? 0 : (r.amount || 0)), 0);

    res.json({
      success: true,
      rides: formattedRides,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats: {
        total: stats[0]?.total || 0,
        totalAmount: totalRegularAmount,
        rentalAmount: totalRentalAmount,
        byCustomer: stats[0]?.byCustomer || 0,
        byDriver: stats[0]?.byDriver || 0,
        byAdmin: stats[0]?.byAdmin || 0
      }
    });
  } catch (error) {
    console.error('Get cancelled rides error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// @desc    Export cancelled rides
// @route   GET /api/admin/cancelled-rides/export
// @access  Private (Admin)
exports.exportCancelledRides = async (req, res) => {
  try {
    const { type = 'all', reason = 'all', startDate, endDate } = req.query;

    let query = { status: 'cancelled' };

    if (type !== 'all') {
      query.role = type === 'cab' ? 'cab_ride' : 'goods_ride';
    }
    if (reason !== 'all') {
      query.cancelledBy = reason;
    }
    if (startDate && endDate) {
      query.cancelledAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const rides = await Ride.find(query)
      .populate('customerId', 'name phone')
      .populate('driverId', 'name phone')
      .populate('bookedPassengers', 'name phone');

    // Get rentals for rental amount
    const Rental = require('../models/Rental');
    let rentalMap = new Map();
    try {
      const rentals = await Rental.find({ status: 'cancelled' });
      rentals.forEach(rental => {
        if (rental.customerId) {
          rentalMap.set(rental.customerId.toString(), rental.totalPrice || rental.cost || 0);
        }
      });
    } catch (err) {
      console.log('Error fetching rentals:', err.message);
    }

    const csvData = rides.map(r => {
      // Get customer name properly
      let customerName = 'N/A';
      let customerPhone = 'N/A';
      
      if (r.role === 'cab_ride' && r.bookedPassengers && r.bookedPassengers.length > 0) {
        customerName = r.bookedPassengers[0].name || 'N/A';
        customerPhone = r.bookedPassengers[0].phone || 'N/A';
      } else if (r.customerId) {
        customerName = r.customerId.name || 'N/A';
        customerPhone = r.customerId.phone || 'N/A';
      }

      // Get rental amount
      let rentalAmount = 0;
      if (r.customerId && rentalMap.has(r.customerId._id.toString())) {
        rentalAmount = rentalMap.get(r.customerId._id.toString());
      }

      const isRental = r.price === 0 && rentalAmount > 0;
      const displayAmount = isRental ? rentalAmount : (r.price || 0);

      return {
        'Ride ID': r._id,
        'Type': r.role === 'cab_ride' ? 'Cab Ride' : 'Goods Delivery',
        'Customer': customerName,
        'Customer Phone': customerPhone,
        'Driver': r.driverId?.name || 'N/A',
        'Driver Phone': r.driverId?.phone || 'N/A',
        'From': r.fromCity || 'N/A',
        'To': r.toCity || 'N/A',
        'Amount': displayAmount,
        'Rental Amount': rentalAmount,
        'Cancelled By': r.cancelledBy || 'Unknown',
        'Reason': r.cancelReason || 'No reason',
        'Date': new Date(r.cancelledAt || r.createdAt).toLocaleString()
      };
    });

    const headers = Object.keys(csvData[0] || {});
    const csvRows = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
    ];
    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=cancelled_rides_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export cancelled rides error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// @desc    Generate custom report
// @route   GET /api/admin/reports/generate
// @access  Private (Admin)
exports.generateReport = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let reportData = {};
    let chartData = [];

    switch (type) {
      case 'revenue':
        // Get payments data
        const payments = await Payment.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: 'paid' } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              amount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalCount = payments.reduce((sum, p) => sum + p.count, 0);

        reportData = {
          summary: {
            total: totalRevenue,
            count: totalCount,
            average: totalCount > 0 ? totalRevenue / totalCount : 0,
            growth: 12.5
          },
          breakdown: [
            { name: 'Cab Rides', value: totalRevenue * 0.6, percentage: 60 },
            { name: 'Goods Delivery', value: totalRevenue * 0.4, percentage: 40 }
          ],
          details: payments.map(p => ({
            date: p._id,
            revenue: p.amount,
            transactions: p.count
          }))
        };
        chartData = payments.map(p => ({ name: p._id, value: p.amount, rides: p.count }));
        break;

      case 'rides':
        // Get rides data
        const rides = await Ride.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              ongoing: { $sum: { $cond: [{ $in: ['$status', ['accepted', 'ongoing']] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalRides = rides.reduce((sum, r) => sum + r.count, 0);
        const totalCompleted = rides.reduce((sum, r) => sum + r.completed, 0);
        const totalCancelled = rides.reduce((sum, r) => sum + r.cancelled, 0);
        const totalOngoing = rides.reduce((sum, r) => sum + r.ongoing, 0);

        reportData = {
          summary: {
            total: totalRides,
            completed: totalCompleted,
            cancelled: totalCancelled,
            ongoing: totalOngoing,
            completionRate: totalRides > 0 ? (totalCompleted / totalRides) * 100 : 0
          },
          breakdown: [
            { name: 'Completed', value: totalCompleted, percentage: totalRides > 0 ? (totalCompleted / totalRides) * 100 : 0 },
            { name: 'Ongoing', value: totalOngoing, percentage: totalRides > 0 ? (totalOngoing / totalRides) * 100 : 0 },
            { name: 'Cancelled', value: totalCancelled, percentage: totalRides > 0 ? (totalCancelled / totalRides) * 100 : 0 }
          ],
          details: rides.map(r => ({
            date: r._id,
            rides: r.count,
            completed: r.completed,
            ongoing: r.ongoing,
            cancelled: r.cancelled
          }))
        };
        chartData = rides.map(r => ({ name: r._id, rides: r.count, completed: r.completed, cancelled: r.cancelled }));
        break;

      case 'users':
        // Get users data
        const users = await User.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              customers: { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
              drivers: { $sum: { $cond: [{ $in: ['$role', ['cab_driver', 'goods_driver']] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalUsers = users.reduce((sum, u) => sum + u.count, 0);
        const totalCustomers = users.reduce((sum, u) => sum + u.customers, 0);
        const totalDrivers = users.reduce((sum, u) => sum + u.drivers, 0);

        reportData = {
          summary: {
            total: totalUsers,
            customers: totalCustomers,
            drivers: totalDrivers,
            growth: 8.5
          },
          breakdown: [
            { name: 'Customers', value: totalCustomers, percentage: totalUsers > 0 ? (totalCustomers / totalUsers) * 100 : 0 },
            { name: 'Drivers', value: totalDrivers, percentage: totalUsers > 0 ? (totalDrivers / totalUsers) * 100 : 0 }
          ],
          details: users.map(u => ({
            date: u._id,
            newUsers: u.count,
            customers: u.customers,
            drivers: u.drivers
          }))
        };
        chartData = users.map(u => ({ name: u._id, users: u.count, customers: u.customers, drivers: u.drivers }));
        break;

      case 'drivers':
        // Get drivers data
        const cabDrivers = await CabDriverProfile.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const goodsDrivers = await GoodsDriverProfile.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalCabDrivers = cabDrivers.reduce((sum, d) => sum + d.count, 0);
        const totalGoodsDrivers = goodsDrivers.reduce((sum, d) => sum + d.count, 0);
        const totalApproved = cabDrivers.reduce((sum, d) => sum + d.approved, 0) + goodsDrivers.reduce((sum, d) => sum + d.approved, 0);
        const totalPending = cabDrivers.reduce((sum, d) => sum + d.pending, 0) + goodsDrivers.reduce((sum, d) => sum + d.pending, 0);

        reportData = {
          summary: {
            total: totalCabDrivers + totalGoodsDrivers,
            cabDrivers: totalCabDrivers,
            goodsDrivers: totalGoodsDrivers,
            approved: totalApproved,
            pending: totalPending
          },
          breakdown: [
            { name: 'Cab Drivers', value: totalCabDrivers, percentage: (totalCabDrivers + totalGoodsDrivers) > 0 ? (totalCabDrivers / (totalCabDrivers + totalGoodsDrivers)) * 100 : 0 },
            { name: 'Goods Drivers', value: totalGoodsDrivers, percentage: (totalCabDrivers + totalGoodsDrivers) > 0 ? (totalGoodsDrivers / (totalCabDrivers + totalGoodsDrivers)) * 100 : 0 }
          ],
          details: cabDrivers.map(d => ({
            date: d._id,
            cabDrivers: d.count,
            cabApproved: d.approved,
            cabPending: d.pending
          }))
        };
        chartData = cabDrivers.map(d => ({ name: d._id, drivers: d.count, approved: d.approved, pending: d.pending }));
        break;

      default:
        reportData = { summary: {}, details: [] };
    }

    res.json({
      success: true,
      report: reportData,
      chartData
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
// @desc    Export revenue report
// @route   GET /api/admin/reports/revenue/export
// @access  Private (Admin)
exports.exportRevenueReport = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let startDate, endDate;
    const now = new Date();

    if (period === 'week') {
      startDate = new Date(now.setDate(now.getDate() - 7));
      endDate = new Date();
    } else if (period === 'month') {
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      endDate = new Date();
    } else if (period === 'quarter') {
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      endDate = new Date();
    } else {
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      endDate = new Date();
    }

    const payments = await Payment.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const csvData = payments.map(p => ({
      'Date': p._id,
      'Revenue': p.amount,
      'Transactions': p.count,
      'Average': p.amount / p.count
    }));

    const headers = Object.keys(csvData[0] || {});
    const csvRows = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
    ];
    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=revenue_report_${period}_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export revenue report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// ============ RENTALS (Simple Display) ============

// Get all rentals for display
exports.getRentalsList = async (req, res) => {
  try {
    const rentals = await Rental.find()
      .sort({ createdAt: -1 })
      .populate('customerId', 'name phone')
      .populate('driverId', 'name phone');

    // Get all drivers with their vehicle numbers
    const cabDrivers = await CabDriverProfile.find().lean();
    const goodsDrivers = await GoodsDriverProfile.find().lean();

    // Create map of driverId -> vehicle number
    const driverVehicleMap = new Map();

    cabDrivers.forEach(driver => {
      if (driver.userId && driver.regNumber) {
        driverVehicleMap.set(driver.userId.toString(), driver.regNumber);
      }
    });

    goodsDrivers.forEach(driver => {
      if (driver.userId && driver.regNumber) {
        driverVehicleMap.set(driver.userId.toString(), driver.regNumber);
      }
    });

    const formattedRentals = rentals.map(rental => {
      // Calculate duration
      let duration = 'N/A';
      if (rental.startDate && rental.endDate) {
        const days = Math.ceil((new Date(rental.endDate) - new Date(rental.startDate)) / (1000 * 60 * 60 * 24));
        duration = `${days} day${days > 1 ? 's' : ''}`;
      }

      // Extract data from counterOffers if root fields are missing
      let displayCounterOffer = rental.counterOfferPrice;
      let displayDriverName = rental.driverName || rental.driverId?.name;
      let displayDriverPhone = rental.driverPhone || rental.driverId?.phone;
      let displayDriverId = rental.driverId?._id || rental.driverId;

      if (rental.counterOffers && rental.counterOffers.length > 0) {
        // Use the most recent counter offer if root fields are missing
        const latestOffer = rental.counterOffers[rental.counterOffers.length - 1];
        if (!displayCounterOffer) displayCounterOffer = latestOffer.price;
        if (!displayDriverName) displayDriverName = latestOffer.driverName;
        if (!displayDriverPhone) displayDriverPhone = latestOffer.driverPhone;
        if (!displayDriverId) displayDriverId = latestOffer.driverId;
      }

      // Get vehicle number from driver's profile
      const vehicleNumber = displayDriverId ? driverVehicleMap.get(displayDriverId.toString()) : null;

      return {
        _id: rental._id,
        vehicleNumber: vehicleNumber || 'N/A',  // Only vehicle number
        vehicleType: rental.vehicleType === 'cab' ? 'cab' : 'goods',
        cost: rental.totalPrice || 0,
        counterOfferPrice: displayCounterOffer || null,  // ADD THIS LINE
        customerName: rental.customerName || rental.customerId?.name || 'N/A',
        customerNumber: rental.customerPhone || rental.customerId?.phone || 'N/A',
        driverName: displayDriverName || 'Not assigned',
        driverNumber: displayDriverPhone || 'N/A',
        duration: duration,
        startDate: rental.startDate,
        endDate: rental.endDate,
        status: rental.status,
        isRoundTrip: rental.isRoundTrip,
        leavingFrom: rental.leavingFrom,
        goingTo: rental.goingTo
      };
    });

    res.json({ success: true, rentals: formattedRentals });
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: true, rentals: [] });
  }
};

// ============ PASSWORD RESET REQUESTS ============

// @desc    Get all password reset requests
exports.getPasswordResetRequests = async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, requests });
  } catch (error) {
    console.error('Get password resets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Approve password reset request (Sets default password: 123456)
exports.approvePasswordReset = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the request
    const request = await PasswordResetRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    if (request.status === 'resolved') {
      return res.status(400).json({ success: false, message: 'Request already resolved' });
    }

    // Find the user by phone
    const user = await User.findOne({ phone: request.phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found for this phone number' });
    }

    // Hash default password 'Dump@Drop'
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Dump@Drop', salt);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    // Mark request as resolved
    request.status = 'resolved';
    await request.save();

    res.json({ success: true, message: 'Password reset to default (Dump@Drop) successfully' });
  } catch (error) {
    console.error('Approve password reset error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};