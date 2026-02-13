import { api } from '../services/api.js';
import { renderNavbar } from '../components/Navbar.js';

const formatBytes = (bytes = 0) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default async function Admin() {
    const container = document.createElement('div');
    container.className = 'page-container';

    container.innerHTML = `
        <div class="main-content admin-loading">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">Loading Admin Metrics...</p>
        </div>
    `;

    try {
        const user = await api.get('/users/me');
        if (!user.isAdmin) {
            container.innerHTML = `
                ${renderNavbar('dashboard', user)}
                <main class="main-content app-shell admin-empty-state">
                    <h2 style="color: var(--status-broken); margin-bottom: 0.5rem;">Access denied</h2>
                    <p class="text-muted">Admin access is required for this page.</p>
                </main>
            `;
            return container;
        }

        const usage = await api.get('/admin/usage');
        const metrics = usage.metrics || {};
        const limits = usage.limits || {};
        const topUsers = usage.topUsers || [];

        container.innerHTML = `
            ${renderNavbar('admin', user)}
            <main class="main-content app-shell admin-page">
                <header class="page-header page-hero admin-hero">
                    <div>
                        <h1 class="page-title admin-title">Admin Usage</h1>
                        <p class="text-muted">Generated: ${new Date(usage.generatedAt || Date.now()).toLocaleString()}</p>
                    </div>
                </header>

                <div class="admin-summary-grid">
                    <div class="card admin-metric-card"><h3>Total Users</h3><div class="admin-metric-value">${metrics.usersCount ?? 0}</div></div>
                    <div class="card admin-metric-card"><h3>Total Servers</h3><div class="admin-metric-value">${metrics.totalServers ?? 0}</div></div>
                    <div class="card admin-metric-card"><h3>Running Servers</h3><div class="admin-metric-value">${metrics.runningServers ?? 0}</div></div>
                    <div class="card admin-metric-card"><h3>Expired Servers</h3><div class="admin-metric-value">${metrics.expiredServers ?? 0}</div></div>
                    <div class="card admin-metric-card"><h3>Transactions</h3><div class="admin-metric-value">${metrics.transactionsCount ?? 0}</div></div>
                    <div class="card admin-metric-card"><h3>Estimated Storage</h3><div class="admin-metric-value">${formatBytes(metrics.estimatedFileStorageBytes)}</div></div>
                </div>

                <div class="admin-panels">
                    <div class="card">
                        <h3 class="admin-section-title">Configured Limits</h3>
                        <div class="admin-limits-list">
                            <div><span class="text-muted">Max servers per user:</span> ${limits.MAX_SERVERS_PER_USER ?? '-'}</div>
                            <div><span class="text-muted">Max env vars per server:</span> ${limits.MAX_ENV_VARS_PER_SERVER ?? '-'}</div>
                            <div><span class="text-muted">Max env key length:</span> ${limits.MAX_ENV_KEY_LENGTH ?? '-'}</div>
                            <div><span class="text-muted">Max env value length:</span> ${limits.MAX_ENV_VALUE_LENGTH ?? '-'}</div>
                            <div><span class="text-muted">Max single file size:</span> ${formatBytes(limits.MAX_SINGLE_FILE_BYTES)}</div>
                            <div><span class="text-muted">Max total files per server:</span> ${formatBytes(limits.MAX_TOTAL_FILES_BYTES)}</div>
                            <div><span class="text-muted">Transaction retention:</span> ${limits.TRANSACTION_RETENTION_DAYS ?? '-'} day(s)</div>
                            <div><span class="text-muted">Expired server grace:</span> ${limits.EXPIRED_SERVER_GRACE_DAYS ?? '-'} day(s)</div>
                        </div>
                    </div>

                    <div class="card admin-table-card">
                        <h3 class="admin-section-title">Top Storage Users</h3>
                        <div class="admin-table-wrap">
                        <table class="admin-users-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Servers</th>
                                    <th>Usage</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topUsers.length === 0 ? '<tr><td colspan="3" class="admin-table-empty">No usage data</td></tr>' : topUsers.map((item) => `
                                    <tr>
                                        <td>${item.username || item.email || item.userId}</td>
                                        <td>${item.servers}</td>
                                        <td class="admin-usage-cell">${formatBytes(item.estimatedFileBytes)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>
            </main>
        `;
    } catch (error) {
        const status403 = String(error?.message || '').includes('403');
        container.innerHTML = `
            <div class="main-content" style="text-align: center;">
                <h2 style="color: var(--status-broken);">${status403 ? 'Access denied' : 'Failed to load admin usage'}</h2>
                <p class="text-muted">${status403 ? 'Your account is not authorized as admin.' : (error.message || 'Unknown error')}</p>
            </div>
        `;
    }

    return container;
}