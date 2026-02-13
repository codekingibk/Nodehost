const fs = require('fs').promises;
const path = require('path');
const Server = require('../models/Server');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { LIMITS, ECONOMY } = require('../utils/constants');
const { BASE_TMP_DIR } = require('./rehydration');
const { stopServer } = require('./processManager');

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const backfillLegacyServerLifecycle = async () => {
    const legacyServers = await Server.find({
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null }
        ]
    });

    if (!legacyServers.length) return;

    for (const server of legacyServers) {
        const baseDate = server.createdAt ? new Date(server.createdAt) : new Date();
        server.expiresAt = addDays(baseDate, ECONOMY.SERVER_DURATION_DAYS || 10);
        if (!server.renewedAt) server.renewedAt = baseDate;
        await server.save();
    }

    console.log(`[Maintenance] Backfilled lifecycle fields for ${legacyServers.length} legacy server(s)`);
};

const cleanupOldTransactions = async () => {
    const cutoff = addDays(new Date(), -LIMITS.TRANSACTION_RETENTION_DAYS);
    const result = await Transaction.deleteMany({ timestamp: { $lt: cutoff } });
    if (result.deletedCount > 0) {
        console.log(`[Maintenance] Deleted ${result.deletedCount} old transaction(s)`);
    }
};

const cleanupExpiredServers = async () => {
    const graceCutoff = addDays(new Date(), -LIMITS.EXPIRED_SERVER_GRACE_DAYS);

    const staleServers = await Server.find({
        expiresAt: { $lt: graceCutoff }
    });

    if (!staleServers.length) return;

    const affectedUsers = new Map();

    for (const server of staleServers) {
        try {
            await stopServer(server.serverId);
        } catch (e) {
            console.warn(`[Maintenance] Failed to stop server ${server.serverId} before delete: ${e.message}`);
        }

        try {
            await fs.rm(path.join(BASE_TMP_DIR, server.serverId), { recursive: true, force: true });
        } catch (e) {
            console.warn(`[Maintenance] Failed to cleanup files for ${server.serverId}: ${e.message}`);
        }

        affectedUsers.set(server.userId, (affectedUsers.get(server.userId) || 0) + 1);
    }

    await Server.deleteMany({ _id: { $in: staleServers.map((server) => server._id) } });

    for (const [userId, removedCount] of affectedUsers.entries()) {
        const user = await User.findOne({ clerkId: userId });
        if (!user) continue;
        user.activeServers = Math.max(0, (user.activeServers || 0) - removedCount);
        await user.save();
    }

    console.log(`[Maintenance] Removed ${staleServers.length} expired server(s) past grace period`);
};

const runMaintenanceTasks = async () => {
    try {
        await backfillLegacyServerLifecycle();
        await cleanupOldTransactions();
        await cleanupExpiredServers();
    } catch (error) {
        console.error('[Maintenance] Failed to run tasks:', error.message);
    }
};

const startMaintenanceScheduler = () => {
    runMaintenanceTasks();

    setInterval(() => {
        runMaintenanceTasks();
    }, LIMITS.MAINTENANCE_INTERVAL_MS);

    console.log(`[Maintenance] Scheduler started (interval: ${Math.floor(LIMITS.MAINTENANCE_INTERVAL_MS / (60 * 1000))} minutes)`);
};

module.exports = {
    runMaintenanceTasks,
    startMaintenanceScheduler
};
