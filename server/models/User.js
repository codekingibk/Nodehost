const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    required: true,
    unique: true
  },
  email: String,
  username: String,
  coins: {
    type: Number,
    default: 100
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastDailyClaim: {
    type: Date
  },
  totalServersCreated: {
    type: Number,
    default: 0
  },
  activeServers: {
    type: Number,
    default: 0
  },
  referralCode: {
    type: String,
    unique: true,
    required: true
  },
  referredBy: {
    type: String // Clerk ID
  },
  referrals: [{
    type: String // Clerk IDs
  }],
  referralEarnings: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('User', UserSchema);