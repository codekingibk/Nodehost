const express = require('express');
const router = express.Router();
const Server = require('../models/Server');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { requireAuth } = require('../middleware/auth');
const { ECONOMY, LIMITS, TRANSACTION_TYPES, SERVER_STATUS } = require('../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { stopServer } = require('../services/processManager');
const { rehydrate, BASE_TMP_DIR } = require('../services/rehydration');
const fs = require('fs').promises;
const path = require('path');

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const isExpired = (server) => !!(server.expiresAt && new Date(server.expiresAt).getTime() < Date.now());
const withLifecycleMeta = (serverDoc) => {
    const server = serverDoc.toObject ? serverDoc.toObject() : serverDoc;
    const expired = isExpired(server);
    const expiresAtTs = server.expiresAt ? new Date(server.expiresAt).getTime() : 0;
    const daysRemaining = expired
        ? 0
        : Math.max(0, Math.ceil((expiresAtTs - Date.now()) / (24 * 60 * 60 * 1000)));

    return {
        ...server,
        isExpired: expired,
        daysRemaining
    };
};

router.get('/', requireAuth, async (req, res) => {
    try {
        const servers = await Server.find({ userId: req.auth.userId });
        res.json(servers.map(withLifecycleMeta));
    } catch (e) {
        console.error("GET /servers Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.auth.userId;

        const currentServerCount = await Server.countDocuments({ userId });
        if (currentServerCount >= LIMITS.MAX_SERVERS_PER_USER) {
            return res.status(400).json({
                error: `Server limit reached. Maximum ${LIMITS.MAX_SERVERS_PER_USER} servers per account.`
            });
        }

        const user = await User.findOne({ clerkId: userId });
        if (user.coins < ECONOMY.SERVER_COST) {
            return res.status(400).json({ error: 'Insufficient coins' });
        }

        // Deduct coins
        user.coins -= ECONOMY.SERVER_COST;
        user.totalServersCreated += 1;
        user.activeServers += 1; // Assuming limit checks?
        await user.save();

        await Transaction.create({
            userId,
            type: TRANSACTION_TYPES.SERVER_CREATE,
            amount: -ECONOMY.SERVER_COST,
            balance: user.coins,
            metadata: { serverName: name }
        });

        // Create server
        const serverId = uuidv4();
        const now = new Date();
        const newServer = new Server({
            serverId,
            userId,
            name,
            expiresAt: addDays(now, ECONOMY.SERVER_DURATION_DAYS),
            renewedAt: now,
            fileSystem: new Map() // Start empty
        });
        
        await newServer.save();
        res.json(withLifecycleMeta(newServer));
    } catch (e) {
        console.error("POST /servers Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    const server = await Server.findOne({ serverId: req.params.id, userId: req.auth.userId });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    res.json(withLifecycleMeta(server));
});

router.post('/:id/renew', requireAuth, async (req, res) => {
    try {
        const server = await Server.findOne({ serverId: req.params.id, userId: req.auth.userId });
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const user = await User.findOne({ clerkId: req.auth.userId });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.coins < ECONOMY.SERVER_COST) {
            return res.status(400).json({ error: `Insufficient coins. Renewal costs ${ECONOMY.SERVER_COST}.` });
        }

        user.coins -= ECONOMY.SERVER_COST;
        await user.save();

        const baseDate = server.expiresAt && new Date(server.expiresAt).getTime() > Date.now()
            ? new Date(server.expiresAt)
            : new Date();

        server.expiresAt = addDays(baseDate, ECONOMY.SERVER_DURATION_DAYS);
        server.renewedAt = new Date();
        await server.save();

        await Transaction.create({
            userId: req.auth.userId,
            type: TRANSACTION_TYPES.SERVER_RENEW,
            amount: -ECONOMY.SERVER_COST,
            balance: user.coins,
            metadata: {
                serverId: server.serverId,
                serverName: server.name,
                renewedUntil: server.expiresAt
            }
        });

        return res.json({
            success: true,
            server: withLifecycleMeta(server),
            coins: user.coins
        });
    } catch (e) {
        console.error('POST /servers/:id/renew Error:', e);
        return res.status(500).json({ error: e.message });
    }
});

router.post('/:id/settings', requireAuth, async (req, res) => {
    try {
        const server = await Server.findOne({ serverId: req.params.id, userId: req.auth.userId });
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const allowedNodeVersions = ['16', '18', '20', '22'];
        const requestedNodeVersion = String(req.body?.nodeVersion || '18').trim();
        if (!allowedNodeVersions.includes(requestedNodeVersion)) {
            return res.status(400).json({ error: 'Invalid node version selected' });
        }

        const incomingEnvVars = req.body?.envVars || {};
        if (typeof incomingEnvVars !== 'object' || Array.isArray(incomingEnvVars)) {
            return res.status(400).json({ error: 'Invalid env vars format' });
        }

        const envEntries = Object.entries(incomingEnvVars);
        if (envEntries.length > LIMITS.MAX_ENV_VARS_PER_SERVER) {
            return res.status(400).json({
                error: `Too many env vars. Max allowed is ${LIMITS.MAX_ENV_VARS_PER_SERVER}.`
            });
        }

        const sanitizedEnv = new Map();
        for (const [rawKey, rawValue] of envEntries) {
            const key = String(rawKey || '').trim();
            if (!key) continue;
            if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
                return res.status(400).json({ error: `Invalid env var key: ${key}` });
            }

            const value = String(rawValue ?? '');
            if (value.length > LIMITS.MAX_ENV_VALUE_LENGTH) {
                return res.status(400).json({
                    error: `Env var value too long for ${key}. Max length is ${LIMITS.MAX_ENV_VALUE_LENGTH}.`
                });
            }
            sanitizedEnv.set(key, value);
        }

        server.nodeVersion = requestedNodeVersion;
        server.envVars = sanitizedEnv;
        server.markModified('envVars');
        await server.save();

        return res.json({
            success: true,
            settings: {
                nodeVersion: server.nodeVersion,
                envVars: Object.fromEntries(server.envVars || [])
            }
        });
    } catch (e) {
        console.error('POST /servers/:id/settings Error:', e);
        return res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    const server = await Server.findOne({ serverId: req.params.id, userId: req.auth.userId });
    if (!server) return res.status(404).json({ error: 'Server not found' });

    // Stop process
    await stopServer(server.serverId);

    // Delete from DB
    await Server.deleteOne({ serverId: server.serverId });

    // Cleanup disk
    try {
        await fs.rm(path.join(BASE_TMP_DIR, server.serverId), { recursive: true, force: true });
    } catch (e) { console.error(e); }

    // Update stats
    const user = await User.findOne({ clerkId: req.auth.userId });
    user.activeServers = Math.max(0, user.activeServers - 1);
    await user.save();

    res.json({ success: true });
});

module.exports = router;