const mongoose = require('mongoose');
const Rental = require('../models/Rental');
const CabDriverProfile = require('../models/CabDriverProfile');
const GoodsDriverProfile = require('../models/GoodsDriverProfile');
const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Publish a rental request (broadcast)
// @route   POST /api/rental/publish
// @access  Private (Customer only)
exports.publishRental = async (req, res) => {
    try {
        let { 
            startDate, endDate, vehicleType, 
            pricePerDay, totalPrice,
            pickupLat, pickupLng, dropLat, dropLng, distance, isRoundTrip,
            leavingFrom, goingTo, passengers, hasLuggage
        } = req.body;
        
        // Normalize vehicle type
        if (vehicleType === 'passenger') vehicleType = 'cab';
        
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(startDate);
        
        if (isNaN(start.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start date' });
        }

        const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const finalPrice = totalPrice || (pricePerDay * diffDays);

        const rental = await Rental.create({
            customerId: req.user._id,
            vehicleType: vehicleType || 'cab',
            startDate: start,
            endDate: end,
            pricePerDay: pricePerDay || 0,
            totalPrice: finalPrice || 0,
            status: 'published',
            customerName: req.user.name || 'Customer',
            customerPhone: req.user.phone || '',
            pickupLat, pickupLng, dropLat, dropLng, distance, isRoundTrip,
            leavingFrom, goingTo, passengers, hasLuggage,
            location: {
                lat: pickupLat,
                lng: pickupLng
            }
        });

        res.status(201).json({ success: true, data: rental });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get published rentals for drivers to see
// @route   GET /api/rental/published
// @access  Private (Driver only)
exports.getPublishedRentals = async (req, res) => {
    try {
        const { role } = req.user;
        const vehicleType = role === 'goods_driver' ? 'goods' : 'cab';
        
        const rentals = await Rental.find({
            status: 'published',
            vehicleType: vehicleType
        }).sort({ createdAt: -1 });
        
        res.status(200).json({ success: true, data: rentals });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Submit a counter offer for a published rental
// @route   POST /api/rental/counter-offer
// @access  Private (Driver only)
exports.submitCounterOffer = async (req, res) => {
    try {
        const { rentalId, price, note, carDetails } = req.body;
        const rental = await Rental.findById(rentalId);

        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
        if (rental.status !== 'published') return res.status(400).json({ success: false, message: 'Rental is no longer available' });

        // Add counter offer
        let profile = await CabDriverProfile.findOne({ userId: req.user._id });
        let isCab = true;
        if (!profile) {
            profile = await GoodsDriverProfile.findOne({ userId: req.user._id });
            isCab = false;
        }

        let mergedCarDetails = carDetails || {};
        if (profile) {
            mergedCarDetails = {
                brand: profile.brand || mergedCarDetails.brand || '',
                model: profile.model || mergedCarDetails.model || '',
                type: profile.vehicleType || mergedCarDetails.type || '',
                color: profile.color || mergedCarDetails.color || '',
                year: profile.year || mergedCarDetails.year || '',
                seats: isCab ? (profile.seatCapacity || mergedCarDetails.seats || '') : (profile.capacity || mergedCarDetails.seats || ''),
                ac: isCab ? (profile.isAC === true ? 'Yes' : 'No') : 'No'
            };
        }

        rental.counterOffers.push({
            driverId: req.user._id,
            driverName: req.user.name || 'Driver',
            driverPhone: req.user.phone || '',
            price,
            note,
            carDetails: mergedCarDetails,
            status: 'pending'
        });

        await rental.save();

        // Notify customer
        await Notification.create({
            toUserId: rental.customerId,
            fromUserId: req.user._id,
            title: 'New Rental Counter-Offer',
            body: `A driver has submitted a counter-offer of ₹${price} for your rental request.`,
            extra: { rentalId: rental._id, type: 'rental_offer' }
        });

        res.status(200).json({ success: true, message: 'Counter-offer submitted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Accept a counter offer
// @route   POST /api/rental/accept-offer
// @access  Private (Customer only)
exports.acceptCounterOffer = async (req, res) => {
    try {
        const { rentalId, offerId } = req.body;
        const rental = await Rental.findById(rentalId);

        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
        if (rental.customerId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });

        const offer = rental.counterOffers.id(offerId);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

        offer.status = 'accepted';
        rental.driverId = offer.driverId;
        rental.driverName = offer.driverName;
        rental.driverPhone = offer.driverPhone;
        rental.counterOfferPrice = offer.price;
        rental.note = offer.note;
        rental.otp = Math.floor(1000 + Math.random() * 9000).toString();
        rental.status = 'pending'; // Change to pending for driver to start or active if starting immediately

        await rental.save();

        // Notify driver
        await Notification.create({
            toUserId: offer.driverId,
            fromUserId: req.user._id,
            title: 'Counter-Offer Accepted',
            body: `Your counter-offer for the rental was accepted.`,
            extra: { rentalId: rental._id, type: 'rental_accepted' }
        });

        res.status(200).json({ success: true, data: rental });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Verify OTP to start rental
// @route   POST /api/rental/verify-otp
// @access  Private (Driver only)
exports.verifyOTP = async (req, res) => {
    try {
        const { rentalId, otp } = req.body;
        const rental = await Rental.findById(rentalId);

        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
        if (rental.driverId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });

        if (rental.otp === otp || otp === '1234') { // Allow 1234 for testing
            rental.status = 'active';
            // Generate completion OTP for ending the ride
            rental.completionOtp = Math.floor(1000 + Math.random() * 9000).toString();
            await rental.save();

            // Notify customer about the new completion OTP
            await Notification.create({
                toUserId: rental.customerId,
                fromUserId: req.user._id,
                title: 'Rental Started',
                body: `Your rental has started. Use OTP ${rental.completionOtp} to finish the ride later.`,
                extra: { rentalId: rental._id, status: 'active', completionOtp: rental.completionOtp }
            });

            return res.status(200).json({ success: true, message: 'Rental started', data: rental });
        }

        res.status(400).json({ success: false, message: 'Invalid OTP' });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Finish rental
// @route   PATCH /api/rental/:id/finish
// @access  Private (Driver only)
exports.finishRental = async (req, res) => {
    try {
        const { otp } = req.body;
        const rental = await Rental.findById(req.params.id);
        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
        
        if (rental.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Rental is not active' });
        }

        if (rental.completionOtp !== otp && otp !== '4321') { // Allow 4321 for testing
            return res.status(400).json({ success: false, message: 'Invalid completion OTP' });
        }

        rental.status = 'completed';
        await rental.save();

        // Free up driver
        const ProfileModel = (rental.vehicleType === 'cab') ? CabDriverProfile : GoodsDriverProfile;
        await ProfileModel.findOneAndUpdate({ userId: req.user._id }, { $set: { isOnline: true } });

        res.status(200).json({ success: true, message: 'Rental finished' });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Cancel rental
// @route   PATCH /api/rental/:id/cancel
// @access  Private
exports.cancelRental = async (req, res) => {
    try {
        const rental = await Rental.findById(req.params.id);
        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });

        // Only allow cancellation if pending or accepted
        if (rental.status !== 'pending' && rental.status !== 'accepted') {
            return res.status(400).json({ success: false, message: 'Cannot cancel active or completed rental' });
        }

        rental.status = 'cancelled';
        await rental.save();

        // If it was accepted, free up driver
        if (rental.status === 'accepted') {
            const ProfileModel = (rental.vehicleType === 'cab') ? CabDriverProfile : GoodsDriverProfile;
            await ProfileModel.findOneAndUpdate({ userId: rental.driverId }, { $set: { isOnline: true } });
        }

        res.status(200).json({ success: true, message: 'Rental cancelled' });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get rental history
// @route   GET /api/rental/history
// @access  Private
exports.getHistory = async (req, res) => {
    try {
        const history = await Rental.find({
            $or: [
                { customerId: req.user._id },
                { driverId: req.user._id }
            ],
            status: 'completed'
        }).sort({ createdAt: -1 });
        
        res.status(200).json({ success: true, data: history });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get active rental offers for driver
// @route   GET /api/rental/offers
// @access  Private (Driver only)
exports.getOffers = async (req, res) => {
    try {
        const offers = await Rental.find({
            $or: [
                { customerId: req.user._id },
                { driverId: req.user._id },
                { 'counterOffers.driverId': req.user._id }
            ],
            status: { $in: ['published', 'pending', 'accepted', 'active', 'completed', 'cancelled', 'rejected'] }
        }).sort({ createdAt: -1 });

        // Map fields for frontend compatibility (RentalOffer model expects basePrice/counterPrice)
        const mappedData = offers.map(offer => {
            const doc = offer.toObject();
            return {
                ...doc,
                id: doc._id,
                basePrice: doc.pricePerDay || 0,
                counterPrice: doc.counterOfferPrice || null
            };
        });
        
        res.status(200).json({ success: true, data: mappedData });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get active rental for customer or driver
// @route   GET /api/rental/active
// @access  Private
exports.getActiveRental = async (req, res) => {
    try {
        // Find most recent rental that is NOT cancelled, rejected or completed
        const active = await Rental.findOne({
            $or: [
                { customerId: req.user._id },
                { driverId: req.user._id }
            ],
            status: { $in: ['pending', 'accepted', 'active'] }
        }).sort({ createdAt: -1 });

        if (active) {
            const doc = active.toObject();
            const normalized = {
                ...doc,
                id: doc._id,
                basePrice: doc.pricePerDay || 0,
                counterPrice: doc.counterOfferPrice || null
            };
            return res.status(200).json({ success: true, data: normalized });
        }

        res.status(200).json({ success: true, data: null });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Customer counters a driver's offer
// @route   POST /api/rental/customer-counter
// @access  Private (Customer only)
exports.customerCounterOffer = async (req, res) => {
    try {
        const { rentalId, offerId, price } = req.body;
        const rental = await Rental.findById(rentalId);

        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
        if (rental.customerId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });

        // Limit customer from sending multiple counter requests
        const hasActiveCounter = rental.counterOffers.some(o => 
            o.status === 'customer_countered' && 
            (!o.customerCounterExpiresAt || o.customerCounterExpiresAt > Date.now())
        );

        if (hasActiveCounter) {
            return res.status(400).json({ success: false, message: 'You already have an active counter request.' });
        }

        const offer = rental.counterOffers.id(offerId);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

        offer.status = 'customer_countered';
        offer.customerPrice = price;
        offer.customerCounterExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        await rental.save();

        // Notify driver
        await Notification.create({
            toUserId: offer.driverId,
            fromUserId: req.user._id,
            title: 'New Customer Counter-Offer',
            body: `Customer has countered your offer with ₹${price}.`,
            extra: { rentalId: rental._id, type: 'rental_offer' }
        });

        res.status(200).json({ success: true, message: 'Counter-offer sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Driver responds (accept/reject) to customer's counter offer
// @route   POST /api/rental/driver-respond-counter
// @access  Private (Driver only)
exports.driverRespondCounter = async (req, res) => {
    try {
        const { rentalId, offerId, action } = req.body;
        const rental = await Rental.findById(rentalId);

        if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });

        const offer = rental.counterOffers.id(offerId);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (offer.driverId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });

        // Check expiry
        if (offer.customerCounterExpiresAt && offer.customerCounterExpiresAt < Date.now()) {
            offer.status = 'rejected';
            await rental.save();
            return res.status(400).json({ success: false, message: 'Offer has expired' });
        }

        if (action === 'accept') {
            offer.status = 'accepted';
            rental.driverId = offer.driverId;
            rental.driverName = offer.driverName;
            rental.driverPhone = offer.driverPhone;
            rental.counterOfferPrice = offer.customerPrice;
            rental.note = offer.note;
            rental.otp = Math.floor(1000 + Math.random() * 9000).toString();
            rental.status = 'pending'; // Start the ride
            await rental.save();

            // Notify customer
            await Notification.create({
                toUserId: rental.customerId,
                fromUserId: req.user._id,
                title: 'Offer Accepted',
                body: `Driver has accepted your counter offer!`,
                extra: { rentalId: rental._id, type: 'rental_accepted' }
            });

            return res.status(200).json({ success: true, data: rental });
        } else if (action === 'reject') {
            offer.status = 'rejected';
            await rental.save();

            // Notify customer
            await Notification.create({
                toUserId: rental.customerId,
                fromUserId: req.user._id,
                title: 'Offer Rejected',
                body: `Driver has rejected your counter offer.`,
                extra: { rentalId: rental._id, type: 'rental_rejected' }
            });

            return res.status(200).json({ success: true, message: 'Offer rejected' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
