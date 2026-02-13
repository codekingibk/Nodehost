const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const Server = require('../models/Server');
const Transaction = require('../models/Transaction');
const { LIMITS } = require('../utils/constants');
const { getAdminIds, getAdminEmails, isAdminUser } = require('../utils/admin');

const ensureAdmin = async (req, res, next) => {
    const adminIds = getAdminIds();
    const adminEmails = getAdminEmails();
    if (!adminIds.length && !adminEmails.length) {
        return res.status(403).json({ error: 'Admin access not configured' });
    }

    const claims = req.auth?.sessionClaims || req.auth?.claims || {};
    const claimsEmail = claims.email || claims.primaryEmailAddress || claims.email_address || null;

    let dbEmail = null;
    if (!claimsEmail) {
        const dbUser = await User.findOne({ clerkId: req.auth.userId }, { email: 1 });
        dbEmail = dbUser?.email || null;
    }

    if (!isAdminUser({ userId: req.auth.userId, email: claimsEmail || dbEmail })) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    next();
};

const getFileSystemBytes = (fileSystem) => {
    if (!fileSystem || typeof fileSystem.entries !== 'function') return 0;
    let total = 0;
    for (const [, fileData] of fileSystem.entries()) {
        const content = typeof fileData === 'string' ? fileData : (fileData?.content || '');
        total += Buffer.byteLength(String(content), 'utf8');
    }
    return total;
};

router.get('/usage', requireAuth, ensureAdmin, async (req, res) => {
    try {
        const now = Date.now();

        const [usersCount, transactionsCount, servers] = await Promise.all([
            User.countDocuments({}),
            Transaction.countDocuments({}),
            Server.find({})
        ]);

        const totalServers = servers.length;
        const runningServers = servers.filter((server) => server.status === 'RUNNING').length;
        const expiredServers = servers.filter((server) => server.expiresAt && new Date(server.expiresAt).getTime() < now).length;

        const userUsage = new Map();
        let totalFileBytes = 0;

        for (const server of servers) {
            const bytes = getFileSystemBytes(server.fileSystem);
            totalFileBytes += bytes;

            const current = userUsage.get(server.userId) || {
                userId: server.userId,
                servers: 0,
                estimatedFileBytes: 0
            };

            current.servers += 1;
            current.estimatedFileBytes += bytes;
            userUsage.set(server.userId, current);
        }

        const topUsersRaw = Array.from(userUsage.values())
            .sort((a, b) => b.estimatedFileBytes - a.estimatedFileBytes)
            .slice(0, 10);

        const topUserIds = topUsersRaw.map((entry) => entry.userId);
        const dbUsers = await User.find({ clerkId: { $in: topUserIds } }, { clerkId: 1, username: 1, email: 1 });
        const userInfoById = new Map(dbUsers.map((user) => [user.clerkId, user]));

        const topUsers = topUsersRaw.map((entry) => {
            const info = userInfoById.get(entry.userId);
            return {
                ...entry,
                username: info?.username || null,
                email: info?.email || null
            };
        });

        return res.json({
            generatedAt: new Date().toISOString(),
            metrics: {
                usersCount,
                totalServers,
                runningServers,
                expiredServers,
                transactionsCount,
                estimatedFileStorageBytes: totalFileBytes
            },
            limits: LIMITS,
            topUsers
        });
    } catch (error) {
        console.error('GET /admin/usage error:', error);
        return res.status(500).json({ error: 'Failed to load usage metrics' });
    }
});

module.exports = router;