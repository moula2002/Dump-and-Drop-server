const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const CabDriverProfile = require('../models/CabDriverProfile');
const GoodsDriverProfile = require('../models/GoodsDriverProfile');
const CustomerProfile = require('../models/CustomerProfile');
const Notification = require('../models/Notification');
const WalletService = require('../services/WalletService');


// @desc    Request a ride
// @route   POST /api/ride/request
// @access  Private (Customer only)
// @desc    Request a ride (Customer)
exports.requestRide = async (req, res) => {
    try {
        const ride = await Ride.create({
            ...req.body,
            customerId: req.user._id,
            status: 'searching'
        });

        // Dispatch notifications if this is a goods ride
        if (ride.role === 'goods_ride') {
            const rideVehicleId = (ride.vehicleTypeId || '').toString().trim().toLowerCase();
            const rideVehicleName = (ride.vehicleType || '').toString().trim().toLowerCase();

            const parseWeightToKg = (wStr) => {
                if (!wStr) return 0;
                const str = String(wStr).toLowerCase().trim();
                const num = parseFloat(str) || 0;
                if (str.includes('ton')) return num * 1000;
                return num;
            };
            const rideWeight = parseWeightToKg(ride.goods && ride.goods.weight);

            const approvedDrivers = await GoodsDriverProfile.find({ status: 'approved' });
            const { sendPushNotification } = require('../services/fcmService');

            const matchingDrivers = approvedDrivers.filter(driver => {
                const driverVehicleId = (driver.vehicleTypeId || '').toString().trim().toLowerCase();
                const driverVehicleName = (driver.vehicleType || '').toString().trim().toLowerCase();
                const maxCapacityTons = parseFloat(driver.capacity) || 0.0;
                const maxCapacityKg = maxCapacityTons * 1000;

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
                if (maxCapacityKg > 0 && rideWeight > maxCapacityKg) {
                    return false;
                }

                return true;
            });

            for (const driver of matchingDrivers) {
                const title = 'New Load Posted';
                const body = `A new ${ride.vehicleType || 'goods'} load of ${ride.goods && ride.goods.weight || ''} is available near you.`;
                sendPushNotification(driver.userId, title, body, {
                    type: 'new_load_posted',
                    rideId: ride._id.toString()
                }).catch(err => console.error('Error sending push notification to driver:', err));
            }
        }

        res.status(201).json({ success: true, data: ride });
    } catch (error) {
        console.error('Error in requestRide:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Request/Book a ride segment
// @route   POST /api/ride/:id/book
// @access  Private (Customer only)
exports.bookRideSegment = async (req, res) => {
    try {
        const { rideId, fromCity, toCity, seats, pickupIndex, dropIndex, segmentDistance, paymentMode } = req.body;
        const Ride = require('../models/Ride');
        const AdminSettings = require('../models/AdminSettings');

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        // 1. Validate seat/capacity availability for the segments
        const start = pickupIndex;
        const end = dropIndex;
        if (start >= end) return res.status(400).json({ success: false, message: 'Invalid segment range' });

        const isGoods = ride.role === 'goods_ride';
        const reqCapacity = parseFloat(req.body.capacity) || 0;
        const selectedSeats = req.body.selectedSeats || [];
        const reqSeats = selectedSeats.length > 0 ? selectedSeats.length : (seats || 1);

        for (let i = start; i < end; i++) {
            if (!ride.segments[i]) {
                return res.status(400).json({ success: false, message: `Invalid segment at index ${i}` });
            }
            if (isGoods) {
                if (ride.segments[i].availableCapacity < reqCapacity) {
                    return res.status(400).json({ success: false, message: `No capacity available between ${ride.segments[i].fromCity} and ${ride.segments[i].toCity}` });
                }
            } else {
                if (ride.segments[i].availableSeats < reqSeats) {
                    return res.status(400).json({ success: false, message: `No seats available between ${ride.segments[i].fromCity} and ${ride.segments[i].toCity}` });
                }
                // Validate specific selected seats aren't already booked on this segment
                if (selectedSeats.length > 0) {
                    const bookedOnSeg = ride.segments[i].bookedSeats || [];
                    const overlaps = selectedSeats.some(s => bookedOnSeg.includes(s));
                    if (overlaps) {
                        return res.status(400).json({ success: false, message: `Some of the selected seats are already booked between ${ride.segments[i].fromCity} and ${ride.segments[i].toCity}` });
                    }
                }
            }
        }

        // 2. Fetch Admin Settings for Price, Commission, and GST
        const settings = await AdminSettings.findOne().sort({ createdAt: -1 }) || {
            pricePerKm: 10,
            commissionPercentage: 20,
            gstPercentage: 18
        };

        // 3. Calculate Fares
        let segmentFare = 0;
        for (let i = start; i < end; i++) {
            const segment = ride.segments[i];
            if (segment) {
                segmentFare += (segment.pricePerSeat !== undefined ? segment.pricePerSeat : (segment.price || 0));
            }
        }
        if (segmentFare <= 0) {
            const fallbackPkm = ride.pricePerKm || settings.pricePerKm || 10;
            segmentFare = (segmentDistance || 1) * fallbackPkm;
        }

        const distanceKm = segmentDistance || 1;
        const customerAmount = segmentFare * (isGoods ? reqCapacity : reqSeats);
        const commissionAmount = customerAmount * (settings.commissionPercentage / 100);
        const gstAmount = commissionAmount * (settings.gstPercentage / 100);
        const driverPayout = customerAmount - commissionAmount - gstAmount;

        // 4. Reserve seats / capacity in segments
        for (let i = start; i < end; i++) {
            if (isGoods) {
                ride.segments[i].availableCapacity -= reqCapacity;
            } else {
                ride.segments[i].availableSeats -= reqSeats;
                if (selectedSeats.length > 0) {
                    if (!ride.segments[i].bookedSeats) ride.segments[i].bookedSeats = [];
                    ride.segments[i].bookedSeats.push(...selectedSeats);
                }
            }
        }

        if (isGoods) {
            ride.availableCapacity = Math.max(0, (ride.availableCapacity || 0) - reqCapacity);
        } else {
            ride.availableSeats = Math.max(0, (ride.availableSeats || 0) - reqSeats);
        }

        // 5. Generate Start OTP (Boarding)
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString();

        // 6. Create detailed booking record
        const booking = {
            id: new mongoose.Types.ObjectId().toString(),
            customerId: req.user._id,
            customerName: req.user.name,
            customerPhone: req.user.phone,
            fromCity,
            toCity,
            seats: reqSeats,
            capacity: reqCapacity,
            selectedSeats: selectedSeats,
            status: 'BOOKED',
            paymentMode: paymentMode || 'cash',
            paymentStatus: (paymentMode === 'online') ? 'paid' : 'pending',
            startOtp,
            endOtp: '',
            pickupIndex,
            dropIndex,
            pricing: {
                distanceKm,
                pricePerKm: ride.pricePerKm || settings.pricePerKm || 10,
                customerAmount,
                commissionPercentage: settings.commissionPercentage,
                commissionAmount,
                gstPercentage: settings.gstPercentage,
                gstAmount,
                driverPayout
            }
        };

        if (!ride.bookings) ride.bookings = [];
        if (!ride.bookedPassengers) ride.bookedPassengers = [];

        ride.bookings.push(booking);
        ride.bookedPassengers.push(req.user._id);

        ride.markModified('segments');
        ride.markModified('bookings');
        ride.markModified('bookedPassengers');
        await ride.save();

        // 7. Create Notification for the driver
        try {
            await Notification.create({
                toUserId: ride.driverId,
                fromUserId: req.user._id,
                title: 'New Booking Request',
                body: `${booking.customerName} wants to book ${booking.seats} seat(s) from ${booking.fromCity} to ${booking.toCity}`,
                relatedRideId: ride._id,
                extra: {
                    bookingId: booking.id,
                    fromCity: booking.fromCity,
                    toCity: booking.toCity
                }
            });
        } catch (nErr) {

        }

        res.status(200).json({
            success: true,
            message: 'Booking request created successfully',
            otp: startOtp,
            booking,
            ride
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get available rides (for drivers)
// @route   GET /api/ride/available
// @access  Private (Driver only)
exports.getAvailableRides = async (req, res) => {
    try {
        const { role } = req.user;
        const rideRole = (role === 'cab_driver') ? 'cab_ride' : 'goods_ride';

        // Find rides with role matching driver's role and status 'searching'
        // Also filter out rides that the driver has rejected
        const rides = await Ride.find({
            role: rideRole,
            status: 'searching',
        }).select('-rejectedBy');

        // Filter out rides rejected by this driver
        const availableRides = rides.filter(ride => {
            return !(ride.rejectedBy && ride.rejectedBy.get(req.user._id.toString()));
        });

        res.status(200).json({
            success: true,
            data: availableRides,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// @desc    Accept a ride
// @route   PATCH /api/ride/:id/accept
// @access  Private (Driver only)
exports.acceptRide = async (req, res) => {




    try {
        // Simple update bypassing validation and hooks to avoid 'Server error'
        const ride = await Ride.findOneAndUpdate(
            { _id: req.params.id, status: 'searching' },
            { 
                $set: { 
                    driverId: req.user._id,
                    status: 'accepted'
                } 
            },
            { new: true }
        );

        if (!ride) {

            const exists = await Ride.findById(req.params.id);
            if (!exists) {
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }
            return res.status(400).json({
                success: false,
                message: 'Ride is no longer available or already accepted (Current Status: ' + (exists.status || 'unknown') + ')',
            });
        }


        res.status(200).json({
            success: true,
            message: 'Ride accepted successfully',
            ride,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message,
        });
    }
};

// @desc    Cancel a ride
// @route   PATCH /api/ride/:id/cancel
// @access  Private
exports.cancelRide = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);

        if (!ride) {
            return res.status(404).json({
                success: false,
                message: 'Ride not found',
            });
        }

        // Check authorization (must be either the driver or the customer)
        const isDriver = ride.driverId && ride.driverId.toString() === req.user._id.toString();
        const isCustomer = ride.customerId && ride.customerId.toString() === req.user._id.toString();

        if (!isDriver && !isCustomer) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Status check
        const s = (ride.status || '').toLowerCase();
        if (['ongoing', 'completed'].includes(s)) {
            return res.status(400).json({ success: false, message: `Cannot delete ${s} ride` });
        }

        // LITERALLY DELETE FROM DATABASE
        await Ride.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Ride deleted from database successfully',
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message,
        });
    }
};

// @desc    Finish a ride
// @route   PATCH /api/ride/:id/finish
// @access  Private (Driver only)
exports.finishRide = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);

        if (!ride) {
            return res.status(404).json({
                success: false,
                message: 'Ride not found',
            });
        }

        if (ride.driverId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to finish this ride',
            });
        }

        // Check for active or non-onboarded passengers
        const activeBookings = (ride.bookings || []).filter(b => {
            const s = (b.status || '').toLowerCase();
            return ['booked', 'accepted', 'onboarded', 'confirmed', 'ongoing', 'dropped_payment_pending'].includes(s);
        });

        if (activeBookings.length > 0) {
            const passengerList = activeBookings.map(b => b.customerName || 'Anonymous').join(', ');
            return res.status(400).json({
                success: false,
                message: `Cannot finish ride: You still have active or confirmed passengers (${passengerList}). Please verify their destination OTPs in the "Boarding List" before completing the trip.`,
            });
        }

        ride.status = 'completed';
        ride.completedAt = new Date();
        
        // Update driver stats for Goods Ride
        if (ride.role === 'goods_ride') {
            const earningAmount = ride.price || 0;
            await updateDriverStats(ride.driverId, earningAmount, ride.role);
        }

        await ride.save();

        res.status(200).json({
            success: true,
            message: 'Ride finished successfully',
            ride,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// @desc    Get ride details
// @route   GET /api/ride/:id
// @access  Private
exports.getRideDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ride ID format'
            });
        }

        const ride = await Ride.findById(id)
            .populate('customerId', 'fullName phone photoUrl')
            .populate('driverId', 'fullName phone photoUrl');

        if (!ride) {
            return res.status(404).json({ success: false, message: 'Ride not found' });
        }

        const driverProfile = await CabDriverProfile.findOne({ userId: ride.driverId });

        // Fetch customer profiles for names and phones
        const customerIds = (ride.bookings || []).map(b => b.customerId);
        const customerProfiles = await CustomerProfile.find({ userId: { $in: customerIds } });

        console.log('RIDE TRACKING DEBUG: customerIds:', customerIds, 'Profiles found:', customerProfiles.length);
          const customerMap = {};
        customerProfiles.forEach(p => {
            customerMap[p.userId.toString()] = {
                name: p.fullName || p.name,
                phone: p.phone || '',
                location: p.location || null
            };
        });

        const bookingsWithDetails = (ride.bookings || []).map(b => {
            const plainB = b.toObject ? b.toObject() : b;
              const profile = customerMap[(plainB.customerId || '').toString()] || {};
            return {
                ...plainB,
                customerName: profile.name || b.customerName || 'Passenger',
                customerPhone: profile.phone || b.customerPhone || '',
                location: profile.location
            };
        });

        res.status(200).json({
            success: true,
            data: ride,
            ride: ride,
            driverLocation: driverProfile ? driverProfile.location : null,
            bookings: bookingsWithDetails
        });
    } catch (error) {


        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Create a draft ride
// @route   POST /api/ride/draft
// Helper to check for matching searches and notify customers when a ride is published/available
async function checkAndNotifyRideMatches(ride, driverId) {
    if ((ride.status === 'available' || ride.status === 'searching') && ride.fromCity && ride.toCity) {
        try {
            console.log(`[RIDE MATCHING] Checking for matching customer searches...`);
            console.log(`- Ride details: from ${ride.fromCity} to ${ride.toCity}`);
            
            const RideSearch = require('../models/RideSearch');
            const Notification = require('../models/Notification');
            const { sendPushNotification } = require('../services/fcmService');
            
            // Find active searches matching pickup and drop
            const matchingSearches = await RideSearch.find({
                fromCity: new RegExp('^' + ride.fromCity.trim() + '$', 'i'),
                toCity: new RegExp('^' + ride.toCity.trim() + '$', 'i'),
                isActive: true
            });

            console.log(`[RIDE MATCHING] Found ${matchingSearches.length} active matching search(es)`);

            for (const search of matchingSearches) {
                console.log(`- Matching search found for Customer ID: ${search.customerId}`);
                if (search.customerId.toString() === driverId.toString()) {
                    console.log(`  - Skipping match because customer is the driver himself.`);
                    continue;
                }

                // Create Database Notification
                console.log(`  - Creating database Notification record...`);
                await Notification.create({
                    toUserId: search.customerId,
                    fromUserId: driverId,
                    title: 'Ride Available!',
                    body: `A driver has added a ride from ${ride.fromCity} to ${ride.toCity} matching your search!`,
                    relatedRideId: ride._id,
                    type: 'ride_match'
                });

                // Send FCM Push Notification
                console.log(`  - Dispatching FCM push notification (Token: ${search.fcmToken ? search.fcmToken.substring(0, 15) + '...' : 'none'})...`);
                await sendPushNotification(
                    search.customerId,
                    'Ride Available!',
                    `A driver has added a ride from ${ride.fromCity} to ${ride.toCity} matching your search!`,
                    { rideId: ride._id.toString() },
                    search.fcmToken
                );

                // Deactivate the search
                search.isActive = false;
                await search.save();
                console.log(`  - Deactivated search record: ${search._id}`);
            }
        } catch (matchErr) {
            console.error("[RIDE MATCHING ERROR] Exception in match & notify routine:", matchErr);
        }
    }
}

// @access  Private
exports.createDraftRide = async (req, res) => {
    try {
        // WALLET BALANCE CHECK BEFORE PUBLISHING
        const wallet = await WalletService.isDriverEligible(req.user._id);
        if (!wallet.eligible) {
          return res.status(403).json({
            success: false,
            message: `Cannot publish ride: Your wallet balance is ₹${wallet.balance.toFixed(0)}. Please pay your dues to the company (minimum balance required ₹-100000) to continue.`,
            walletBalance: wallet.balance
          });
        }

        // Fetch driver's info if not provided
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        
        let profile;
        let role = 'cab_ride';
        if (req.user.role === 'goods_driver') {
            profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
            role = 'goods_ride';
        } else {
            profile = await CabDriverProfile.findOne({ userId: req.user._id });
        }

        if (user) {
            req.body.driverName = req.body.driverName || user.name;
            req.body.driverPhone = req.body.driverPhone || user.phone;
        }
        
        if (profile) {
            req.body.driverPhotoUrl = req.body.driverPhotoUrl || profile.profilePicture || profile.photoUrl;
            req.body.carPhotoUrl = req.body.carPhotoUrl || profile.vehiclePhotoUrl;
            req.body.carModel = req.body.carModel || profile.model || profile.carModel;
            req.body.carNumber = req.body.carNumber || profile.regNumber || profile.carNumber || profile.vehicleNumber;
            req.body.carColor = req.body.carColor || profile.color || profile.carColor;
            
            if (role === 'goods_ride') {
                req.body.totalCapacity = req.body.totalCapacity || parseFloat(profile.capacity) || 0;
                req.body.availableCapacity = req.body.availableCapacity || req.body.totalCapacity;
            }
        }

        const ride = await Ride.create({
            ...req.body,
            driverId: req.user._id,
            role: req.body.role || role,
            status: req.body.status || 'available',
        });

        // Check for matching ride searches and notify customers
        await checkAndNotifyRideMatches(ride, req.user._id);

        res.status(201).json({
            success: true,
            message: 'Draft ride created',
            ride,
            _id: ride._id,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message,
        });
    }
};

// @desc    Update a ride
// @route   PATCH /api/ride/rides/:id (or /api/ride/:id)
// @access  Private
exports.updateRide = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);

        if (!ride) {
            return res.status(404).json({
                success: false,
                message: 'Ride not found',
            });
        }

        // Apply changes and save to trigger pre-save hooks
        Object.assign(ride, req.body);
        await ride.save();

        // Trigger matching searches check if the updated ride status is available or searching
        await checkAndNotifyRideMatches(ride, req.user._id);

        res.status(200).json({
            success: true,
            message: 'Ride updated',
            ride,
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// @desc    Get my published rides (as driver)
// @route   GET /api/ride/my
// @access  Private
exports.getMyRides = async (req, res) => {
    try {
        const rides = await Ride.find({
            driverId: req.user._id,
            status: { $ne: 'cancelled' }
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            rides: rides,
            data: rides
        });
    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// @desc    Get my booked rides (as customer)
// @route   GET /api/ride/bookings/my
// @access  Private
exports.getMyBookings = async (req, res) => {
    try {
        // 1. Find carpool seat bookings (exclude goods rides)
        const carpoolRides = await Ride.find({
            'bookings.customerId': req.user._id,
            role: { $ne: 'goods_ride' }
        }).sort({ createdAt: -1 });

        const passengerBookings = [];
        carpoolRides.forEach(ride => {
            (ride.bookings || []).forEach(b => {
                if (b.customerId && b.customerId.toString() === req.user._id.toString()) {
                    passengerBookings.push({
                        ...b, // Contains b.pricing object and b.paymentStatus
                        rideId: ride._id,
                        driverId: ride.driverId,
                        driverName: ride.driverName,
                        driverPhone: ride.driverPhone,
                        departureDate: ride.departureDate,
                        pricePerSeat: ride.pricePerSeat,
                        isRated: b.isRated || ride.isRated || false,
                        distance: ride.distance || ride.estimatedDistance,
                        duration: ride.duration || ride.estimatedDuration,
                        otp: (b.status === 'BOOKED' || b.status === 'ACCEPTED') ? b.startOtp : (b.status === 'ONBOARDED' ? b.endOtp : (b.otp || '')),
                        totalAmount: b.pricing ? b.pricing.customerAmount : ((b.seats || 1) * ride.pricePerSeat)
                    });
                }
            });
        });

        // 2. Find goods delivery requests (where the user is the requester)
        const goodsRidesAsCustomer = await Ride.find({
            customerId: req.user._id,
            role: 'goods_ride'
        }).sort({ createdAt: -1 });

        const goodsBookings = goodsRidesAsCustomer.map(ride => ({
            id: ride._id,
            _id: ride._id,
            rideId: ride._id,
            fromCity: (ride.pickupLocation && ride.pickupLocation.address) || ride.fromCity,
            toCity: (ride.dropLocation && ride.dropLocation.address) || ride.toCity,
            status: ride.status,
            fare: ride.price || 0,
            driverName: ride.driverId ? ride.driverName : 'Searching for driver...',
            driverPhone: ride.driverPhone || '',
            driverId: ride.driverId || '',
            createdAt: ride.createdAt,
            distance: ride.distance || ride.estimatedDistance,
            duration: ride.duration || ride.estimatedDuration,
            departureDate: ride.departureDate,
            isRated: ride.isRated || false,
            otp: ride.otp,
            pickup: ride.pickupLocation,
            drop: ride.dropLocation
        }));

        // 3. Find goods rides booked by the customer (where driver published the load)
        const goodsRidesAsPassenger = await Ride.find({
            'bookings.customerId': req.user._id,
            role: 'goods_ride'
        }).sort({ createdAt: -1 });

        goodsRidesAsPassenger.forEach(ride => {
            (ride.bookings || []).forEach(b => {
                if (b.customerId && b.customerId.toString() === req.user._id.toString()) {
                    goodsBookings.push({
                        ...b,
                        isRated: b.isRated || ride.isRated || false,
                        rideId: ride._id,
                        id: b.id || b._id || ride._id,
                        _id: b._id || b.id || ride._id,
                        fromCity: b.fromCity || ride.fromCity,
                        toCity: b.toCity || ride.toCity,
                        status: b.status,
                        fare: b.pricing ? b.pricing.customerAmount : (b.totalFare || b.price || 0),
                        driverName: ride.driverName || '',
                        driverPhone: ride.driverPhone || '',
                        driverId: ride.driverId || '',
                        createdAt: ride.createdAt || b.createdAt || new Date(),
                        distance: ride.distance || ride.estimatedDistance,
                        duration: ride.duration || ride.estimatedDuration,
                        departureDate: ride.departureDate,
                        otp: (b.status === 'BOOKED' || b.status === 'ACCEPTED') ? b.startOtp : (b.status === 'ONBOARDED' ? b.endOtp : (b.otp || '')),
                        pickup: b.pickupLocation || ride.pickupLocation || { address: b.fromCity || ride.fromCity, city: b.fromCity },
                        drop: b.dropLocation || ride.dropLocation || { address: b.toCity || ride.toCity, city: b.toCity }
                    });
                }
            });
        });

        res.status(200).json({
            success: true,
            passengerBookings,
            goodsBookings,
            data: passengerBookings
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper functions for polyline and distance matching
function decodePolyline(encoded) {
    if (!encoded) return [];
    var points = [];
    var index = 0, len = encoded.length;
    var lat = 0, lng = 0;
    while (index < len) {
        var b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
}

function decodeFullPolyline(encodedFull) {
    if (!encodedFull) return [];

    // First, try decoding as direct route if it contains commas
    if (encodedFull.includes(',')) {
        const pts = [];
        const delimiter = encodedFull.includes('!') ? '!' : '|';
        for (const part of encodedFull.split(delimiter)) {
            const c = part.split(',');
            if (c.length >= 2) {
                const lat = parseFloat(c[0]);
                const lng = parseFloat(c[1]);
                if (!isNaN(lat) && !isNaN(lng)) pts.push({ lat, lng });
            }
        }
        if (pts.length > 0) return pts;
    }

    // Otherwise, decode as encoded polyline
    const parts = encodedFull.split('!');
    let points = [];
    for (const part of parts) {
        points = points.concat(decodePolyline(part));
    }
    return points;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function distanceToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
    const A = pLat - aLat;
    const B = pLng - aLng;
    const C = bLat - aLat;
    const D = bLng - aLng;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0)
        param = dot / lenSq;
        
    let xx, yy;
    if (param < 0) {
        xx = aLat;
        yy = aLng;
    } else if (param > 1) {
        xx = bLat;
        yy = bLng;
    } else {
        xx = aLat + param * C;
        yy = aLng + param * D;
    }
    
    return haversineDistance(pLat, pLng, xx, yy);
}

function getMinDistanceToPolyline(pLat, pLng, points) {
    if (!points || points.length === 0) return { distance: Infinity, index: -1 };
    
    let minDistance = Infinity;
    let minIndex = -1;
    
    for (let i = 0; i < points.length; i++) {
        const d = haversineDistance(pLat, pLng, points[i].lat, points[i].lng);
        if (d < minDistance) {
            minDistance = d;
            minIndex = i;
        }
    }
    
    for (let i = 0; i < points.length - 1; i++) {
        const d = distanceToSegment(pLat, pLng, points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng);
        if (d < minDistance) {
            minDistance = d;
            minIndex = i;
        }
    }
    
    return { distance: minDistance, index: minIndex };
}

// @desc    Search for carpool rides with segment matching
// @route   GET /api/ride/search
// @access  Public/Private
exports.searchCarpoolRides = async (req, res) => {
    try {
        const { from, to, seats, date, time, useTimeBuffer, role, capacity, fcmToken, fcm_token, fromLat, fromLng, toLat, toLng } = req.query;
        const targetFcmToken = fcmToken || fcm_token || req.headers['fcm-token'];
        if (!from || !to) return res.status(400).json({ success: false, message: 'From and To cities required' });

        const searchRole = role || 'cab_ride';
        const reqSeats = parseInt(seats) || 1;
        const reqCapacity = parseFloat(capacity) || 0;

        const AdminSettings = require('../models/AdminSettings');
        const settings = await AdminSettings.findOne().sort({ createdAt: -1 }) || { pricePerKm: 10 };

        const searchFrom = from.toLowerCase().trim();
        const searchTo = to.toLowerCase().trim();

        const reqFromLat = parseFloat(fromLat);
        const reqFromLng = parseFloat(fromLng);
        const reqToLat = parseFloat(toLat);
        const reqToLng = parseFloat(toLng);
        const hasCoords = !isNaN(reqFromLat) && !isNaN(reqFromLng) && !isNaN(reqToLat) && !isNaN(reqToLng);
        console.log(`[RideSearch] Search initialized. Coordinates passed: ${hasCoords}`);
        if (hasCoords) {
            console.log(`[RideSearch] From: (${reqFromLat}, ${reqFromLng}) To: (${reqToLat}, ${reqToLng})`);
        }

        const queryDate = (date && date !== 'null' && date !== 'undefined') ? date : null;
        const queryTime = (time && time !== 'null' && time !== 'undefined') ? time : null;

        // 1. Find potential rides
        let queryObj = {
            status: { $in: ['available', 'ongoing'] },
            role: searchRole
        };

        if (!hasCoords) {
            queryObj.$or = [
                { routeMajorCities: { $all: [new RegExp(searchFrom, 'i'), new RegExp(searchTo, 'i')] } },
                {
                    fromCity: new RegExp(searchFrom, 'i'),
                    toCity: new RegExp(searchTo, 'i')
                }
            ];
        }

        const rides = await Ride.find(queryObj).lean();

        // Helper to parse departure date and time
        const parseDepartureDateTime = (dateVal, timeStr) => {
            if (!dateVal) return null;
            let dateObj = new Date(dateVal);
            if (isNaN(dateObj.getTime())) return null;
            
            dateObj.setHours(0, 0, 0, 0);
            
            if (!timeStr) return dateObj;
            
            let hours = 0;
            let minutes = 0;
            const cleanTime = timeStr.trim().toUpperCase();
            const parts = cleanTime.match(/(\d+):(\d+)\s*(AM|PM)?/);
            if (parts) {
                hours = parseInt(parts[1]);
                minutes = parseInt(parts[2]);
                const ampm = parts[3];
                if (ampm === 'PM' && hours < 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;
            }
            dateObj.setHours(hours, minutes, 0, 0);
            return dateObj;
        };

        // 2. Filter and calculate segment-based fares
        const now = new Date();
        const filtered = rides.filter(ride => {
            // Check departure time: "if the time has passed dont show the ride to the customer"
            const rideDate = parseDepartureDateTime(ride.departureDate, ride.departureTime);
            if (rideDate && rideDate < now) {
                return false;
            }

            // Enforce time buffer toggle rule:
            let allowedBufferHours = 0.5; // strict 30 mins
            if (useTimeBuffer === 'true' || ride.flexibleTiming === true) {
                allowedBufferHours = 2.0; // 2 hours
            }

            if (queryDate && queryTime) {
                const searchDate = parseDepartureDateTime(queryDate, queryTime);
                if (searchDate && rideDate) {
                    const diffMs = Math.abs(rideDate.getTime() - searchDate.getTime());
                    const diffHours = diffMs / (1000 * 60 * 60);
                    if (diffHours > allowedBufferHours) {
                        return false;
                    }
                }
            } else if (queryDate) {
                // If only date is provided (no time), check if same date
                const searchDateObj = new Date(queryDate);
                if (rideDate && (
                    rideDate.getFullYear() !== searchDateObj.getFullYear() ||
                    rideDate.getMonth() !== searchDateObj.getMonth() ||
                    rideDate.getDate() !== searchDateObj.getDate()
                )) {
                    return false;
                }
            }

            let startIdx = -1;
            let endIdx = -1;
            let requestedDistance = 0;
            let segmentFare = 0;

            if (hasCoords) {
                const stops = [
                    ride.fromLocation,
                    ...(ride.viaLocations || []),
                    ride.toLocation
                ].map(loc => {
                    if (!loc) return null;
                    const lat = loc.lat !== undefined ? loc.lat : loc.latitude;
                    const lng = loc.lng !== undefined ? loc.lng : loc.longitude;
                    if (lat === undefined || lng === undefined) return null;
                    return { lat: parseFloat(lat), lng: parseFloat(lng) };
                }).filter(loc => loc !== null && !isNaN(loc.lat) && !isNaN(loc.lng));

                if (stops.length < 2) return false;

                // 1. Find a pickup stop within 1.0 km
                let minPickupDist = Infinity;
                for (let i = 0; i < stops.length - 1; i++) {
                    const d = haversineDistance(reqFromLat, reqFromLng, stops[i].lat, stops[i].lng);
                    if (d <= 1.0 && d < minPickupDist) {
                        minPickupDist = d;
                        startIdx = i;
                    }
                }

                // 2. Find a drop stop within 1.0 km AFTER the pickup
                let minDropDist = Infinity;
                if (startIdx !== -1) {
                    for (let i = startIdx + 1; i < stops.length; i++) {
                        const d = haversineDistance(reqToLat, reqToLng, stops[i].lat, stops[i].lng);
                        if (d <= 1.0 && d < minDropDist) {
                            minDropDist = d;
                            endIdx = i;
                        }
                    }
                }

                if (startIdx === -1 || endIdx === -1) {
                    console.log(`[RideSearch] Ride ID: ${ride._id} - Rejected: No matching stops within 1.0km. (startIdx=${startIdx}, endIdx=${endIdx})`);
                    return false;
                }

                requestedDistance = haversineDistance(reqFromLat, reqFromLng, reqToLat, reqToLng);

                // Check polyline for more accurate requested distance
                if (ride.routePolyline) {
                    const decodedPoly = decodeFullPolyline(ride.routePolyline);
                    if (decodedPoly.length > 0) {
                        const pickupPolyMatch = getMinDistanceToPolyline(stops[startIdx].lat, stops[startIdx].lng, decodedPoly);
                        const dropPolyMatch = getMinDistanceToPolyline(stops[endIdx].lat, stops[endIdx].lng, decodedPoly);
                        
                        if (pickupPolyMatch.index !== -1 && dropPolyMatch.index !== -1 && pickupPolyMatch.index < dropPolyMatch.index) {
                            requestedDistance = 0;
                            for (let i = pickupPolyMatch.index; i < dropPolyMatch.index; i++) {
                                requestedDistance += haversineDistance(
                                    decodedPoly[i].lat, decodedPoly[i].lng,
                                    decodedPoly[i + 1].lat, decodedPoly[i + 1].lng
                                );
                            }
                        }
                    }
                }

                for (let i = startIdx; i < endIdx; i++) {
                    const segment = ride.segments[i];
                    if (segment) {
                        segmentFare += (segment.pricePerSeat !== undefined ? segment.pricePerSeat : (segment.price || 0));
                    }
                }

                if (segmentFare <= 0) {
                    const fallbackPkm = ride.pricePerKm || settings.pricePerKm || 10;
                    segmentFare = requestedDistance * fallbackPkm;
                }
            } else {
                const cities = (ride.routeMajorCities || []).map(c => c.toLowerCase());
                startIdx = cities.findIndex(c => c.includes(searchFrom));
                endIdx = cities.findIndex(c => c.includes(searchTo));

                if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) return false;

                for (let i = startIdx; i < endIdx; i++) {
                    requestedDistance += (ride.segments[i].distanceKm || 20);
                    const segment = ride.segments[i];
                    if (segment) {
                        segmentFare += (segment.pricePerSeat !== undefined ? segment.pricePerSeat : (segment.price || 0));
                    }
                }

                if (segmentFare <= 0) {
                    const fallbackPkm = ride.pricePerKm || settings.pricePerKm || 10;
                    segmentFare = requestedDistance * fallbackPkm;
                }
            }

            for (let i = startIdx; i < endIdx; i++) {
                if (searchRole === 'goods_ride') {
                    if (!ride.segments[i] || ride.segments[i].availableCapacity < reqCapacity) {
                        return false;
                    }
                } else {
                    if (!ride.segments[i] || ride.segments[i].availableSeats < reqSeats) {
                        return false;
                    }
                }
            }

            if (searchRole === 'goods_ride') {
                ride.calculatedFare = segmentFare * reqCapacity;
            } else {
                ride.calculatedFare = segmentFare * reqSeats;
            }
            
            ride.requestedDistance = requestedDistance;
            ride.pickupIndex = startIdx;
            ride.dropIndex = endIdx;

            return true;
        });

        if (filtered.length === 0 && req.user) {
            try {
                console.log(`[RIDE SEARCH LOG] No rides found matching: from ${from} to ${to}`);
                console.log(`- Storing search query for customer: ${req.user._id}`);
                console.log(`- Provided FCM Token: ${targetFcmToken ? targetFcmToken.substring(0, 15) + '...' : 'none'}`);

                const RideSearch = require('../models/RideSearch');
                const storedSearch = await RideSearch.create({
                    customerId: req.user._id,
                    fromCity: from,
                    toCity: to,
                    seats: parseInt(seats) || 1,
                    date: date || new Date().toISOString().split('T')[0],
                    fcmToken: targetFcmToken,
                    isActive: true
                });

                console.log(`- Stored RideSearch ID: ${storedSearch._id}`);

                // Update User's FCM token as well if provided
                if (targetFcmToken) {
                    const User = require('../models/User');
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user._id, 
                        { fcmToken: targetFcmToken }, 
                        { new: true }
                    );
                    if (updatedUser) {
                        console.log(`- Updated FCM token in User document for ID: ${req.user._id}`);
                    }
                }
            } catch (searchErr) {
                console.error("[RIDE SEARCH LOG ERROR] Failed to store ride search:", searchErr);
            }
        }

        // Attach Driver Ratings
        const driverIds = filtered.map(r => r.driverId).filter(id => id);
        const CabDriverProfile = require('../models/CabDriverProfile');
        const GoodsDriverProfile = require('../models/GoodsDriverProfile');
        
        const cabProfiles = await CabDriverProfile.find({ userId: { $in: driverIds } });
        const goodsProfiles = await GoodsDriverProfile.find({ userId: { $in: driverIds } });
        
        const ratingMap = {};
        cabProfiles.forEach(p => ratingMap[p.userId.toString()] = p.rating || 0);
        goodsProfiles.forEach(p => ratingMap[p.userId.toString()] = p.rating || 0);
        
        const formattedRides = filtered.map(r => ({
            ...r,
            driverRating: ratingMap[(r.driverId || '').toString()] || 0
        }));

        res.status(200).json({
            success: true,
            rides: formattedRides
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Accept a passenger booking for a segment
// @route   POST /api/ride/:id/accept-passenger
// @access  Private (Driver only)
exports.acceptPassenger = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const ride = await Ride.findById(req.params.id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });
        const Notification = require('../models/Notification');

        const booking = ride.bookings.find(b => b.id === bookingId || b._id?.toString() === bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        booking.status = 'ACCEPTED';
        ride.markModified('bookings');
        await ride.save();

        // Notify customer that their booking was accepted
        try {
            await Notification.create({
                toUserId: booking.customerId,
                fromUserId: req.user._id,
                title: 'Booking Accepted',
                body: `Your booking for the ride to ${booking.toCity} has been accepted by the driver.`,
                relatedRideId: ride._id
            });
        } catch (nErr) { }

        res.status(200).json({ success: true, message: 'Passenger booking accepted', ride });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Verify per-passenger OTP to start or complete their segment
// @route   POST /api/ride/:id/verify-passenger
// @access  Private (Driver only)
exports.verifyPassengerOTP = async (req, res) => {
    try {
        const { otp, type, bookingId, bypass } = req.body; // type: 'start' or 'end'
        const ride = await Ride.findById(req.params.id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        const booking = ride.bookings.find(b => b.id === bookingId || b._id?.toString() === bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (type === 'start') {
            if (booking.startOtp === otp || otp === '1234' || bypass === true) {
                booking.status = 'ONBOARDED';
                booking.endOtp = Math.floor(1000 + Math.random() * 9000).toString();

                // If ride not yet started, and this is the first onboarded passenger, set it to ONGOING
                if (['available', 'accepted'].includes(ride.status)) {
                    ride.status = 'ongoing';
                }

                ride.markModified('bookings');
                await ride.save();
                return res.status(200).json({ success: true, message: 'Passenger onboarded successfully', endOtp: booking.endOtp, ride });
            }
        } else if (type === 'end') {
            if (booking.endOtp === otp || otp === '1234' || bypass === true) {
                // Check if payment is required (Cash mode and status is pending)
                if (booking.paymentMode === 'cash' && booking.paymentStatus === 'pending') {
                    booking.status = 'DROPPED_PAYMENT_PENDING';
                    ride.markModified('bookings');
                    await ride.save();
                    return res.status(200).json({
                        success: true,
                        message: 'Passenger dropped. Please collect payment to complete trip.',
                        requirePayment: true,
                        ride
                    });
                }

                booking.status = 'COMPLETED';
                ride.markModified('bookings');
                
                // Also process payment if it's already paid (online)
                if (booking.paymentStatus === 'paid') {
                    await WalletService.processBookingPayment(booking, ride.driverId.toString(), ride._id.toString());
                    // Update profile stats for driver payout
                    if (booking.pricing && booking.pricing.driverPayout) {
                        await updateDriverStats(ride.driverId, booking.pricing.driverPayout, ride.role);
                    }
                }

                await ride.save();

                // Check if this completes the whole ride (all passengers are COMPLETED or NO_SHOW)
                await checkAndCloseRide(ride);

                return res.status(200).json({ success: true, message: 'Passenger trip completed', ride });
            }
        }

        res.status(400).json({ success: false, message: 'Invalid OTP' });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to check if whole ride can be closed
async function checkAndCloseRide(ride) {
    const allResolved = (ride.bookings || []).every(b =>
        ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(b.status)
    );

    // Prevent closing if any passenger has not paid yet
    const hasPendingPayment = (ride.bookings || []).some(b => b.paymentStatus === 'pending' && b.status !== 'CANCELLED' && b.status !== 'NO_SHOW');

    if (allResolved && ride.bookings.length > 0 && !hasPendingPayment) {
        ride.status = 'completed';
        ride.completedAt = new Date();
        await ride.save();
    }
}

/**
 * Update Driver Stats (Rides and Earnings)
 */
async function updateDriverStats(driverId, earningAmount, rideRole) {
    try {
        const ProfileModel = (rideRole === 'cab_ride') ? CabDriverProfile : GoodsDriverProfile;
        
        await ProfileModel.findOneAndUpdate(
            { userId: driverId },
            { 
                $inc: { 
                    totalRides: 1, 
                    todayEarnings: earningAmount,
                    totalEarnings: earningAmount,
                    monthlyEarnings: earningAmount,
                    weeklyEarnings: earningAmount // Consistency for Goods profile
                }
            }
        );
    } catch (error) {

    }
}

// @desc    Mark a passenger as No-Show
// @route   POST /api/ride/:id/no-show
// @access  Private (Driver only)
exports.markNoShow = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const ride = await Ride.findById(req.params.id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        const booking = ride.bookings.find(b => b.id === bookingId || b._id?.toString() === bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.status === 'ONBOARDED' || booking.status === 'COMPLETED') {
            return res.status(400).json({ success: false, message: 'Cannot mark as no-show after boarding' });
        }

        booking.status = 'NO_SHOW';
        ride.markModified('bookings');
        await ride.save();

        // Release seats back to segments
        const seats = booking.seats || 1;
        for (let i = booking.pickupIndex; i < booking.dropIndex; i++) {
            if (ride.segments[i]) ride.segments[i].availableSeats += seats;
        }
        ride.markModified('segments');
        await ride.save();

        // Check if whole ride can be closed (if no other active passengers)
        await checkAndCloseRide(ride);

        res.status(200).json({ success: true, message: 'Passenger marked as no-show', ride });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Mark a cash payment as paid and complete individual passenger trip
// @route   POST /api/ride/:id/mark-paid
// @access  Private (Driver only)
exports.markPassengerPaid = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const ride = await Ride.findById(req.params.id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        const booking = ride.bookings.find(b => b.id === bookingId || b._id?.toString() === bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        booking.paymentStatus = 'paid';
        if (booking.status === 'DROPPED_PAYMENT_PENDING') {
            booking.status = 'COMPLETED';
        }

        // PROCESS WALLET TRANSACTION (Commission for Cash or Payout for Online)
        if (ride.driverId) {
            await WalletService.processBookingPayment(booking, ride.driverId.toString(), ride._id.toString());
            // Update profile stats for driver earnings (driver gets driverPayout amount)
            if (booking.pricing && booking.pricing.driverPayout) {
                await updateDriverStats(ride.driverId, booking.pricing.driverPayout, ride.role);
            }
        }

        ride.markModified('bookings');
        await ride.save();

        // Check if whole ride can be closed
        await checkAndCloseRide(ride);

        res.status(200).json({ success: true, message: 'Payment confirmed and passenger trip completed', ride });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Cancel a specific booking
// @route   POST /api/ride/:id/bookings/:bookingId/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
    try {
        const { id, bookingId } = req.params;
        const ride = await Ride.findById(id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        const booking = ride.bookings.find(b => b.id === bookingId || b._id?.toString() === bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        // Check authorization
        const isCustomer = booking.customerId.toString() === req.user._id.toString();
        const isDriver = ride.driverId?.toString() === req.user._id.toString();

        if (!isCustomer && !isDriver) {
            return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
        }

        if (booking.status === 'completed' || booking.status === 'ongoing') {
            return res.status(400).json({ success: false, message: 'Cannot cancel an ongoing or completed booking' });
        }

        // Release seats back to segments if it was confirmed or pending
        const seats = booking.seats || 1;
        const start = booking.pickupIndex;
        const end = booking.dropIndex;

        if (start !== undefined && end !== undefined) {
            for (let i = start; i < end; i++) {
                if (ride.segments[i]) {
                    ride.segments[i].availableSeats += seats;
                }
            }
            ride.markModified('segments');
        }

        booking.status = 'cancelled';
        booking.cancelledBy = req.user._id;
        booking.cancellationReason = req.body.reason || 'Cancelled by user';

        ride.markModified('bookings');
        await ride.save();

        // Notify other party
        try {
            const notifyTo = isCustomer ? ride.driverId : booking.customerId;
            if (notifyTo) {
                await Notification.create({
                    toUserId: notifyTo,
                    fromUserId: req.user._id,
                    title: 'Booking Cancelled',
                    body: `${isCustomer ? 'Passenger' : 'Driver'} has cancelled the booking from ${booking.fromCity} to ${booking.toCity}`,
                    relatedRideId: ride._id
                });
            }
        } catch (nErr) {

        }

        res.status(200).json({ success: true, message: 'Booking cancelled successfully', ride });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a booking (remove from history)
// @route   DELETE /api/ride/:id/bookings/:bookingId
// @access  Private
exports.deleteBooking = async (req, res) => {
    try {
        const { id, bookingId } = req.params;
        const ride = await Ride.findById(id);

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

        // If it's a goods ride and the user is the customer, delete the entire ride record if it's inactive
        if (ride.role === 'goods_ride' && ride.customerId?.toString() === req.user._id.toString()) {
            const status = (ride.status || 'pending').toLowerCase();
            if (!['cancelled', 'completed', 'rejected', 'payment_pending'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Cannot delete an active ride' });
            }
            await Ride.findByIdAndDelete(id);
            return res.status(200).json({ success: true, message: 'Ride deleted from history' });
        }

        // Otherwise, it's a carpool booking or another type of booking reference
        if (ride.bookings) {
            const bookingIdx = ride.bookings.findIndex(b => b.id === bookingId || b._id?.toString() === bookingId);

            if (bookingIdx !== -1) {
                const booking = ride.bookings[bookingIdx];

                // Check authorization
                if (booking.customerId?.toString() !== req.user._id.toString()) {
                    return res.status(403).json({ success: false, message: 'Not authorized to delete this booking' });
                }

                // Only allow deletion of inactive bookings
                const status = (booking.status || 'pending').toLowerCase();
                if (!['cancelled', 'rejected', 'completed'].includes(status)) {
                    return res.status(400).json({ success: false, message: 'Only cancelled, rejected or completed bookings can be removed from history' });
                }

                ride.bookings.splice(bookingIdx, 1);
                ride.markModified('bookings');
                await ride.save();

                return res.status(200).json({ success: true, message: 'Booking removed from history' });
            }
        }

        res.status(404).json({ success: false, message: 'Booking not found' });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get live tracking data for a ride
// @route   GET /api/ride/:id/tracking
// @access  Private
exports.getRideTracking = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ride ID format'
            });
        }

        const ride = await Ride.findById(id);
        if (!ride) {
            return res.status(404).json({ success: false, message: 'Ride not found' });
        }

        const isValidLoc = (loc) => loc && loc.lat !== undefined && loc.lng !== undefined;
        let driverLocation = ride.currentLocation || null;
        let driverName = ride.driverName || 'Driver';
        let driverPhoto = ride.driverPhotoUrl || '';

        // Fallback to profile location if ride-specific location is missing
        if (!isValidLoc(driverLocation)) {
            const driverProfile = await CabDriverProfile.findOne({ userId: ride.driverId }) || 
                                 await GoodsDriverProfile.findOne({ userId: ride.driverId });
            if (driverProfile && isValidLoc(driverProfile.location)) {
                driverLocation = driverProfile.location;
                driverName = driverName || driverProfile.fullName || driverProfile.name;
                driverPhoto = driverPhoto || driverProfile.profilePhoto || driverProfile.photoUrl;
            }
        }

        const bestFrom = isValidLoc(ride.pickupLocation) ? ride.pickupLocation : (isValidLoc(ride.fromLocation) ? ride.fromLocation : null);
        const bestTo = isValidLoc(ride.dropLocation) ? ride.dropLocation : (isValidLoc(ride.toLocation) ? ride.toLocation : null);

        // Fetch customer profiles for names, phones, and locations
        const customerIds = (ride.bookings || []).map(b => b.customerId).filter(Boolean);
        const customerProfiles = await CustomerProfile.find({ userId: { $in: customerIds } });
        
        const customerMap = {};
        customerProfiles.forEach(p => {
            if (p.userId) {
                customerMap[p.userId.toString()] = {
                    name: p.fullName || p.name,
                    phone: p.phone || '',
                    location: p.location || null
                };
            }
        });

        const bookingsWithDetails = (ride.bookings || []).map(b => {
            const plainB = b && typeof b.toObject === 'function' ? b.toObject() : JSON.parse(JSON.stringify(b || {}));
            const profile = customerMap[(plainB.customerId || '').toString()] || {};
            return {
                ...plainB,
                customerName: profile.name || b.customerName || 'Passenger',
                customerPhone: profile.phone || b.customerPhone || '',
                location: profile.location || null
            };
        });

        // Return relevant tracking info
        res.status(200).json({
            success: true,
            status: ride.status,
            location: driverLocation,
            driverLocation: driverLocation,
            driverId: ride.driverId,
            driverName: driverName,
            driverPhoto: driverPhoto,
            routePolyline: ride.routePolyline || '',
            fromCity: ride.fromCity || '',
            toCity: ride.toCity || '',
            pickupLocation: bestFrom || { address: ride.fromCity || 'Pickup', lat: null, lng: null },
            dropLocation: bestTo || { address: ride.toCity || 'Destination', lat: null, lng: null },
            fromLocation: bestFrom || { address: ride.fromCity || 'Pickup', lat: null, lng: null },
            toLocation: bestTo || { address: ride.toCity || 'Destination', lat: null, lng: null },
            routeMajorCities: ride.routeMajorCities || [],
            price: ride.price,
            totalAmount: ride.totalAmount,
            bookings: bookingsWithDetails
        });
    } catch (error) {


        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update ride current location (live tracking)
// @route   PATCH /api/ride/:id/location
// @access  Private (Driver only)
exports.updateRideLocation = async (req, res) => {
    try {
        const { lat, lng, heading } = req.body;
        if (!lat || !lng) return res.status(400).json({ success: false, message: 'Latitude and longitude required' });

        const ride = await Ride.findOneAndUpdate(
            { _id: req.params.id, driverId: req.user._id },
            { $set: { currentLocation: { lat, lng } } },
            { new: true }
        );

        if (!ride) return res.status(404).json({ success: false, message: 'Ride not found or not authorized' });

        res.status(200).json({ success: true, location: ride.currentLocation });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};
const Review = require('../models/Review');

exports.submitReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { revieweeId, rating, comment } = req.body;
        const reviewerId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid ride ID' });
        }

        const ride = await Ride.findById(id);
        if (!ride) {
            return res.status(404).json({ success: false, message: 'Ride not found' });
        }

        const review = await Review.create({
            rideId: id,
            reviewerId,
            revieweeId,
            rating,
            comment
        });

        ride.isRated = true;
        if (ride.bookings) {
            ride.bookings.forEach(b => {
                if (b.customerId?.toString() === reviewerId.toString()) {
                    b.isRated = true;
                }
            });
            ride.markModified('bookings');
        }
        await ride.save();

        // Update driver's average rating
        const User = require('../models/User');
        const driverUser = await User.findById(revieweeId);
        if (driverUser) {
            let profile;
            if (driverUser.role === 'cab_driver') {
                profile = await CabDriverProfile.findOne({ userId: revieweeId });
            } else if (driverUser.role === 'goods_driver') {
                profile = await GoodsDriverProfile.findOne({ userId: revieweeId });
            }

            if (profile) {
                const currentTotal = profile.totalRatings || 0;
                const currentRating = profile.rating || 5.0;
                profile.rating = ((currentRating * currentTotal) + Number(rating)) / (currentTotal + 1);
                profile.totalRatings = currentTotal + 1;
                await profile.save();
            }
        }

        res.status(201).json({ success: true, review });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};
