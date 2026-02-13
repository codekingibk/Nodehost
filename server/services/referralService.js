const crypto = require('crypto');
const User = require('../models/User');

const generateReferralCode = (username) => {
  const randomString = crypto.randomBytes(3).toString('hex');
  // Sanitize username to be safe for URL
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 8);
  return `${safeUsername}-${randomString}`;
};

const validateReferralCode = async (code) => {
    if (!code) return null;
    const referrer = await User.findOne({ referralCode: code });
    return referrer ? referrer.clerkId : null;
};

module.exports = { generateReferralCode, validateReferralCode };