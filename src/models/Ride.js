const mongoose = require('mongoose');

const RideSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Made optional to support driver-published rides
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  role: {
    type: String,
    enum: ['cab_ride', 'goods_ride'],
    required: false, // Made optional for drafts
  },
  pickupLocation: {
    address: String,
    lat: Number,
    lng: Number,
  },
  dropLocation: {
    address: String,
    lat: Number,
    lng: Number,
  },
  pickupDate: {
    type: String,
  },
  pickupTime: {
    type: String,
  },
  vehicleType: {
    type: String,
  },
  vehicleTypeId: {
    type: String,
  },
  price: {
    type: Number,
    required: false, // Made optional for early drafts
  },
  status: {
    type: String,
    enum: ['draft', 'searching', 'available', 'accepted', 'arrived', 'started', 'ongoing', 'completed', 'cancelled'],
    default: 'draft',
  },
  cancelReason: {
    type: String,
    default: '',
  },
  cancelledBy: {
    type: String,
    enum: ['admin', 'driver', 'customer'],
    default: null,
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  otp: {
    type: String,
  },
  distance: {
    type: String,
  },
  duration: {
    type: String,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
  },
  rejectedBy: {
    type: Map,
    of: Date,
    default: {},
  },
  // Published / Inter-city fields
  fromCity: String,
  toCity: String,
  viaCities: [String],
  fromLocation: {
    address: String,
    lat: Number,
    lng: Number,
    city: String,
    state: String,
  },
  toLocation: {
    address: String,
    lat: Number,
    lng: Number,
    city: String,
    state: String,
  },
  viaLocations: [mongoose.Schema.Types.Mixed],
  departureDate: String,
  departureTime: String,
  flexibleTiming: { type: Boolean, default: false },
  carModel: String,
  carNumber: String,
  carColor: String,
  carFeatures: [String],
  totalSeats: { type: Number, default: 4 },
  availableSeats: { type: Number, default: 4 },
  totalCapacity: { type: Number, default: 0 },
  availableCapacity: { type: Number, default: 0 },
  pricePerSeat: { type: Number, default: 0 },
  pricePerKm: { type: Number, default: 10 },
  preferences: {
    smokingAllowed: { type: Boolean, default: false },
    petsAllowed: { type: Boolean, default: false },
    musicAllowed: { type: Boolean, default: true },
    chattingAllowed: { type: Boolean, default: true },
    luggageSpace: { type: Boolean, default: true },
    acAvailable: { type: Boolean, default: true },
  },
  description: String,
  estimatedDistance: Number,
  estimatedDuration: Number,
  routePolyline: String,
  driverName: { type: String, default: '' },
  driverPhone: { type: String, default: '' },
  driverPhotoUrl: { type: String, default: '' },
  driverRating: { type: Number, default: 4.5 },
  routeMajorCities: [String],
  segments: [mongoose.Schema.Types.Mixed],
  bookedPassengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bookings: [mongoose.Schema.Types.Mixed],
  isRated: { type: Boolean, default: false },
  currentLocation: {
    lat: Number,
    lng: Number,
  },
}, {
  timestamps: true,
  strict: false // Allow dynamic data for different ride types
});

RideSchema.pre('save', async function() {
    if (this.fromCity && this.toCity) {
        // Generate segments for carpooling
        const cities = [this.fromCity, ...(this.viaCities || []), this.toCity];
        if (!this.routeMajorCities || this.routeMajorCities.length === 0) {
            this.routeMajorCities = cities;
        }
        
        if (!this.segments || this.segments.length === 0) {
            const segments = [];
            for (let i = 0; i < cities.length - 1; i++) {
                segments.push({
                    fromCity: cities[i],
                    toCity: cities[i+1],
                    availableSeats: this.totalSeats || 4,
                    availableCapacity: this.totalCapacity || 0,
                    price: this.pricePerSeat || 0,
                    pricePerSeat: this.pricePerSeat || 0
                });
            }
            this.segments = segments;
        }

        // Auto-distribute pricePerSeat among segments if they sum up to 0 price
        let totalSegmentPrice = 0;
        if (this.segments && this.segments.length > 0) {
            for (const seg of this.segments) {
                totalSegmentPrice += (seg.pricePerSeat || seg.price || 0);
            }
        }

        const shouldRecalculate = totalSegmentPrice <= 0 || this.isModified('pricePerKm') || this.isModified('pricePerSeat');
        if (shouldRecalculate && this.pricePerSeat > 0 && this.segments && this.segments.length > 0) {
            let totalDistance = 0;
            for (const seg of this.segments) {
                totalDistance += (seg.distanceKm || 0);
            }

            const pkm = this.pricePerKm || (totalDistance > 0 ? this.pricePerSeat / totalDistance : 10);
            if (totalDistance > 0) {
                for (const seg of this.segments) {
                    const segPrice = Math.round((seg.distanceKm || 0) * pkm);
                    seg.price = segPrice;
                    seg.pricePerSeat = segPrice;
                }
            } else {
                const equalPrice = Math.round(this.pricePerSeat / this.segments.length);
                for (const seg of this.segments) {
                    seg.price = equalPrice;
                    seg.pricePerSeat = equalPrice;
                }
            }
            this.markModified('segments');
        }
    }
});

module.exports = mongoose.model('Ride', RideSchema);
