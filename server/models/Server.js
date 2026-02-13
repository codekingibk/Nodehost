const mongoose = require('mongoose');
const { SERVER_STATUS, ECONOMY } = require('../utils/constants');

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const ServerSchema = new mongoose.Schema({
  serverId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(SERVER_STATUS),
    default: SERVER_STATUS.STOPPED
  },
  nodeVersion: {
    type: String,
    default: '18'
  },
  envVars: {
    type: Map,
    of: String,
    default: {}
  },
  fileSystem: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  pid: {
    type: Number
  },
  expiresAt: {
    type: Date,
    required: true
  },
  renewedAt: {
    type: Date
  },
  startedAt: Date,
  stoppedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ServerSchema.pre('validate', function (next) {
  if (!this.expiresAt) {
    const baseDate = this.createdAt ? new Date(this.createdAt) : new Date();
    this.expiresAt = addDays(baseDate, ECONOMY.SERVER_DURATION_DAYS || 10);
    if (!this.renewedAt) {
      this.renewedAt = baseDate;
    }
  }
  next();
});

module.exports = mongoose.model('Server', ServerSchema);