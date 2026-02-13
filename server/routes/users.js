const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { requireAuth } = require('../middleware/auth');
const { generateReferralCode, validateReferralCode } = require('../services/referralService');
const { ECONOMY, TRANSACTION_TYPES } = require('../utils/constants');
const { isAdminUser } = require('../utils/admin');

const normalizeUsername = (username, email, clerkId) => {
    if (username && String(username).trim()) return String(username).trim();
    if (email && String(email).includes('@')) return String(email).split('@')[0];
    return `user_${String(clerkId || '').slice(-6) || 'anon'}`;
};

const getClaimsEmail = (auth = {}) => {
    const claims = auth.sessionClaims || auth.claims || {};
    return claims.email || claims.primaryEmailAddress || claims.email_address || null;
};

const getClaimsUsername = (auth = {}) => {
    const claims = auth.sessionClaims || auth.claims || {};
    return claims.username || claims.preferred_username || claims.name || null;
};

// Sync user from Clerk to MongoDB (Lazy creation)
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { email: emailFromBody, username: usernameFromBody, referralCode: usedReferralCode } = req.body || {};

        const email = emailFromBody || getClaimsEmail(req.auth) || '';
        const preferredUsername = usernameFromBody || getClaimsUsername(req.auth) || '';
        const normalizedUsername = normalizeUsername(preferredUsername, email, clerkId);

        let user = await User.findOne({ clerkId });

        if (!user) {
            // Create new user
            const myReferralCode = generateReferralCode(normalizedUsername || 'user');
            
            user = new User({
                clerkId,
                email,
                username: normalizedUsername,
                referralCode: myReferralCode,
                coins: ECONOMY.INITIAL_BALANCE
            });

            // Handle used referral code
            if (usedReferralCode) {
                 const referrerId = await validateReferralCode(usedReferralCode);
                 if (referrerId && referrerId !== clerkId) {
                     user.referredBy = referrerId;
                     
                     // Award Referrer
                     const referrer = await User.findOne({ clerkId: referrerId });
                     if (referrer) {
                         referrer.coins += ECONOMY.REFERRAL_BONUS;
                         referrer.referralEarnings += ECONOMY.REFERRAL_BONUS;
                         referrer.referrals.push(clerkId);
                         await referrer.save();

                         // Log transaction for referrer
                         await Transaction.create({
                             userId: referrerId,
                             type: TRANSACTION_TYPES.REFERRAL_BONUS,
                             amount: ECONOMY.REFERRAL_BONUS,
                             balance: referrer.coins,
                             metadata: { referredUser: clerkId }
                         });
                     }
                 }
            }

            await user.save();
        } else {
            let changed = false;
            if (email && user.email !== email) {
                user.email = email;
                changed = true;
            }
            if (normalizedUsername && user.username !== normalizedUsername) {
                user.username = normalizedUsername;
                changed = true;
            }
            if (changed) {
                await user.save();
            }
        }

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userData = user.toObject();
    userData.isAdmin = isAdminUser({
        userId: req.auth.userId,
        email: userData.email || getClaimsEmail(req.auth)
    });
    res.json(userData);
});

router.post('/daily-claim', requireAuth, async (req, res) => {
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim) : null;
    
    // Check cooldown
    if (lastClaim) {
        const diff = now - lastClaim;
        const hours = diff / (1000 * 60 * 60);
        if (hours < ECONOMY.DAILY_COOLDOWN_HOURS) {
            const remaining = (ECONOMY.DAILY_COOLDOWN_HOURS * 60 * 60 * 1000) - diff;
            return res.status(400).json({ 
                error: 'Daily claim cooldown', 
                nextClaim: new Date(now.getTime() + remaining) 
            });
        }
    }

    user.coins += ECONOMY.DAILY_REWARD;
    user.lastDailyClaim = now;
    await user.save();

    await Transaction.create({
        userId: user.clerkId,
        type: TRANSACTION_TYPES.DAILY_REWARD,
        amount: ECONOMY.DAILY_REWARD,
        balance: user.coins
    });

    res.json({ success: true, newBalance: user.coins });
});

router.get('/transactions', requireAuth, async (req, res) => {
    const transactions = await Transaction.find({ userId: req.auth.userId }).sort({ timestamp: -1 }).limit(50);
    res.json(transactions);
});

module.exports = router;