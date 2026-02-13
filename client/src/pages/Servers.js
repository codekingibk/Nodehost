import { api } from '../services/api.js';
import { navigate } from '../router.js';
import { renderNavbar } from '../components/Navbar.js';

export default async function Servers() {
    const container = document.createElement('div');
    container.className = 'page-container';

    // Loading State
    container.innerHTML = `
        <div class="main-content" style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">Loading Instances...</p>
        </div>
    `;

    try {
        const [user, servers] = await Promise.all([
            api.get('/users/me'),
            api.get('/servers')
        ]);

        const SERVER_COST = 100;

        const renewServer = async (serverId) => {
            try {
                await api.post(`/servers/${serverId}/renew`, {});
                window.location.reload();
            } catch (err) {
                alert(err.message || 'Failed to renew server');
            }
        };

        const render = () => {
            container.innerHTML = `
                ${renderNavbar('servers', user)}

                <main class="main-content app-shell">
                    <header class="section-header page-hero" style="margin-bottom: 2rem; align-items: flex-end;" id="servers-hero">
                        <div>
                            <h1 class="page-title" style="font-size: 2rem; font-weight: 700;">My Instances</h1>
                            <p class="text-muted">Manage your deployed applications and services.</p>
                        </div>
                        <button id="create-server-btn" class="create-server-btn" data-tour-anchor="create-instance">
                            <i class="fas fa-plus"></i> New Instance
                        </button>
                    </header>

                    <div class="server-grid" id="servers-grid" data-tour-anchor="servers-grid">
                        ${servers.length === 0 ? `
                            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border);">
                                <i class="fas fa-server" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                                <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Active Instances</h3>
                                <p class="text-muted" style="margin-bottom: 1.5rem;">Deploy your first instance to get started.</p>
                                <button class="btn btn-primary" onclick="document.getElementById('create-server-btn').click()">Create Server</button>
                            </div>
                        ` : servers.map(server => `
                            <div class="server-card" data-id="${server.serverId}" onclick="window.location.hash='/server/${server.serverId}'" style="cursor: pointer;">
                                <div class="server-header" style="justify-content: space-between; align-items: center;">
                                    <div>
                                        <div class="status-badge status-${server.isExpired ? 'broken' : server.status.toLowerCase()}" style="margin-bottom: 0.5rem;">
                                            <i class="fas fa-circle" style="font-size: 6px;"></i> ${server.status}
                                        </div>
                                        <h3 class="server-name" style="margin: 0;">${server.name}</h3>
                                    </div>
                                    <div class="server-icon" style="font-size: 1.5rem; color: var(--text-dim); opacity: 0.5;">
                                        <i class="fab fa-node-js"></i>
                                    </div>
                                </div>
                                <div class="server-id" style="margin-bottom: 1rem;">ID: ${server.serverId.substring(0,8)}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.78rem; color: var(--text-muted);">
                                    <span><i class="fas fa-hourglass-half"></i> ${server.isExpired ? 'Expired' : `${server.daysRemaining} day(s) left`}</span>
                                    <span>${server.expiresAt ? new Date(server.expiresAt).toLocaleDateString() : '-'}</span>
                                </div>
                                
                                <div class="server-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: auto;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                                        <i class="fab fa-node-js"></i> Node ${server.nodeVersion || '18'}
                                    </div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                                        <i class="fas fa-key"></i> ${Object.keys(server.envVars || {}).length} env var(s)
                                    </div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                                        <i class="fas fa-calendar-plus"></i> ${server.createdAt ? new Date(server.createdAt).toLocaleDateString() : '-'}
                                    </div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                                        <i class="fas fa-sync-alt"></i> ${server.renewedAt ? new Date(server.renewedAt).toLocaleDateString() : 'Never'}
                                    </div>
                                </div>
                                
                                <div class="server-actions" style="margin-top: 1rem;">
                                    <button class="server-btn" onclick="event.stopPropagation(); window.location.hash='/server/${server.serverId}'">
                                        <i class="fas fa-terminal"></i> Console
                                    </button>
                                     <button class="server-btn" data-renew-id="${server.serverId}" onclick="event.stopPropagation();" style="background: transparent; border: 1px solid ${server.isExpired ? 'var(--status-broken)' : 'var(--border)'}; color: ${server.isExpired ? 'var(--status-broken)' : 'var(--text-primary)'};">
                                        <i class="fas fa-sync-alt"></i> ${server.isExpired ? 'Renew' : 'Extend'}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </main>
            `;

            // Create Server Modal Logic
            const createBtn = container.querySelector('#create-server-btn');
            if(createBtn) {
                createBtn.onclick = () => {
                   if (user.coins < SERVER_COST) {
                        alert(`Insufficient Balance. You need ${SERVER_COST} coins.`);
                        return;
                   }
                   showCreateModal(user);
                }
            }

            container.querySelectorAll('[data-renew-id]').forEach((button) => {
                button.onclick = (event) => {
                    event.stopPropagation();
                    const serverId = button.getAttribute('data-renew-id');
                    renewServer(serverId);
                };
            });
        };

        render();

    } catch (e) {
        console.error(e);
        container.innerHTML = `
            <div class="page-container">
                ${renderNavbar('servers', null)}
                <main class="main-content">
                    <div class="error-state" style="text-align: center; padding: 4rem;">
                        <h2 style="color: var(--status-error);">Error Loading Servers</h2>
                        <p>${e.message}</p>
                        <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
                    </div>
                </main>
            </div>
        `;
    }

    return container;
}

function showCreateModal(user) {
    const SERVER_COST = 100;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
        z-index: 1000; backdrop-filter: blur(5px);
    `;
    
    modal.innerHTML = `
        <div class="modal" style="background: var(--bg-card); padding: 2rem; border-radius: var(--radius-lg); width: 100%; max-width: 500px; border: 1px solid var(--border-card); box-shadow: var(--shadow-glow);">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; font-size: 1.5rem;">New Instance</h3>
                <button class="modal-close" style="background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Server Name</label>
                    <input type="text" id="new-server-name" class="form-input" placeholder="e.g. My Whatsapp Bot" style="width: 100%; padding: 0.75rem; background: var(--bg-app); border: 1px solid var(--border); border-radius: var(--radius-md); color: white;">
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;">
                     <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Image</label>
                     <div style="padding: 0.75rem; background: var(--bg-app); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fab fa-node-js" style="color: #6cc24a;"></i> Node.js 18 (Alpine)
                     </div>
                </div>
                <div class="info-box" style="background: rgba(0,255,136,0.05); border: 1px solid rgba(0,255,136,0.2); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="color: var(--text-muted);">Creation Cost</span>
                        <span style="font-weight: 700; color: var(--accent-primary);">${SERVER_COST} Coins</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                         <span style="color: var(--text-muted);">Duration</span>
                         <span>10 Days</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                         <span style="color: var(--text-muted);">Current Balance</span>
                         <span>${user.coins} Coins</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 1rem;">
                <button class="btn btn-outline modal-cancel" style="background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 0.75rem 1.5rem; border-radius: var(--radius-md); cursor: pointer;">Cancel</button>
                <button class="btn btn-primary" id="confirm-create" style="background: var(--accent-primary); color: black; border: none; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); font-weight: 600; cursor: pointer;">Deploy Server</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal-close').onclick = close;
    modal.querySelector('.modal-cancel').onclick = close;

    modal.querySelector('#confirm-create').onclick = async () => {
        const nameInput = modal.querySelector('#new-server-name');
        const name = nameInput.value;
        if (!name) return nameInput.focus();

        const btn = modal.querySelector('#confirm-create');
        btn.disabled = true;
        btn.innerText = "Deploying...";
        btn.style.opacity = '0.7';

        try {
            await api.post('/servers', { name });
            close();
            // Refresh content via reload for simplicity
            window.location.reload(); 
        } catch (e) {
            alert(e.message || "Failed to create server");
            btn.disabled = false;
            btn.innerText = "Deploy Server";
            btn.style.opacity = '1';
        }
    };
}
