const mongoose = require('mongoose');

const RentalSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional because requests are broadcasted
  },
  vehicleType: {
    type: String,
    enum: ['cab', 'goods', 'passenger'],
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  pricePerDay: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  counterOfferPrice: {
    type: Number,
  },
  counterOffers: [{
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    driverName: String,
    driverPhone: String,
    price: Number,
    customerPrice: Number, // Customer's counter-offer price
    customerCounterExpiresAt: Date, // When the customer's counter offer expires
    note: String,
    carDetails: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'customer_countered'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  note: {
    type: String,
  },
  status: {
    type: String,
    enum: ['published', 'pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'],
    default: 'published',
  },
  otp: {
    type: String,
  },
  completionOtp: {
    type: String,
  },
  location: {
    lat: Number,
    lng: Number,
  },
  customerName: String,
  customerPhone: String,
  driverName: String,
  driverPhone: String,
  carModel: String,
  carNumber: String,
  vehicleCapacity: String,
  goodsType: String,
  rentalId: {
    type: String,
    unique: true,
    sparse: true,
  },
  pickupLat: Number,
  pickupLng: Number,
  dropLat: Number,
  dropLng: Number,
  distance: Number,
  isRoundTrip: Boolean,
  passengers: Number,
  hasLuggage: Boolean,
  loadWeight: String,
  loadingHelp: Boolean,
  leavingFrom: String,
  goingTo: String,
}, {
  timestamps: true,
});

RentalSchema.pre('save', async function() {
  if (!this.rentalId) {
    const random = Math.floor(100000 + Math.random() * 900000);
    this.rentalId = `RENT-${random}`;
  }
});

module.exports = mongoose.model('Rental', RentalSchema);
