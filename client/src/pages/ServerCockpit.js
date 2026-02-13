import { api } from '../services/api.js';
import { navigate } from '../router.js';
import { renderNavbar } from '../components/Navbar.js';
import { io } from "socket.io-client";
import { renderTerminal } from '../components/Terminal.js';
import { renderFileManager } from '../components/FileManager.js';

const SUPPORTED_NODE_VERSIONS = ['16', '18', '20', '22'];

function envObjectToText(envVars = {}) {
    return Object.entries(envVars)
        .map(([key, value]) => `${key}=${value ?? ''}`)
        .join('\n');
}

function parseEnvTextToObject(text = '') {
    const output = {};
    const lines = text.split('\n');

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const equalIndex = line.indexOf('=');
        if (equalIndex <= 0) {
            throw new Error(`Invalid env format: "${line}"`);
        }

        const key = line.slice(0, equalIndex).trim();
        const value = line.slice(equalIndex + 1);

        if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
            throw new Error(`Invalid env key: "${key}"`);
        }

        output[key] = value;
    }

    return output;
}

export default async function ServerCockpit({ id }) {
    const container = document.createElement('div');
    container.className = 'page-container';

    // Loading State
    container.innerHTML = `
        <div class="main-content" style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">Connecting to server...</p>
        </div>
    `;

    let cleanup = null;

    try {
        const server = await api.get(`/servers/${id}`);
        // Handle user fetching failure gracefully
        let user = { username: 'User', coins: 0 };
        try {
            user = await api.get('/users/me');
        } catch(e) {}

        const token = await window.clerk.session.getToken();
        
        const socket = io('/', {
            query: {
                serverId: id,
                userId: window.clerk.user.id
            },
            auth: {
                token
            }
        });

        const render = () => {
             container.innerHTML = `
                ${renderNavbar('servers', user)}
                
                <main class="main-content app-shell">
                    <header class="page-header" style="background: transparent; border-bottom: none; padding-left: 0; padding-right: 0;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <button class="btn btn-outline" id="back-btn" style="padding: 0.5rem 0.75rem;">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <div>
                                <h1 class="page-title" style="margin: 0; font-size: 1.5rem;">${server.name}</h1>
                                <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">
                                    <span class="status-dot ${getStatusHelper(server.status)}" id="server-status-dot"></span>
                                    <span id="server-status-text">${server.status}</span>
                                    <span>•</span>
                                    <span style="font-family: var(--font-mono);">${id.split('-')[0]}</span>
                                </div>
                            </div>
                        </div>
                        <div class="server-actions">
                             <button class="btn btn-primary btn-sm" onclick="alert('Start/Stop implementation pending')"><i class="fas fa-power-off"></i> Power</button>
                        </div>
                    </header>

                    <div class="cockpit-tabs" style="margin-top: 1rem; display: flex; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px;" data-tour-anchor="cockpit-tabs">
                        <button class="cockpit-tab active" data-tab="terminal"><i class="fas fa-terminal"></i> Console</button>
                        <button class="cockpit-tab" data-tab="files"><i class="fas fa-folder-open"></i> Files</button>
                        <button class="cockpit-tab" data-tab="settings"><i class="fas fa-cog"></i> Settings</button>
                    </div>

                    <div id="tab-content" class="content-panel" style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 0; overflow: hidden; margin-top: 1rem;" data-tour-anchor="cockpit-content">
                        <!-- Content Injected Here -->
                    </div>
                </main>
            `;

            container.querySelector('#back-btn').onclick = () => {
                if (cleanup && typeof cleanup === 'function') cleanup();
                socket.disconnect();
                navigate('/servers');
            };

            const content = container.querySelector('#tab-content');
            const tabs = container.querySelectorAll('.cockpit-tab');

            const switchTab = async (tabName) => {
                // Cleanup
                if (cleanup) {
                    if (typeof cleanup === 'function') cleanup();
                    cleanup = null;
                }
                content.innerHTML = '';
                
                tabs.forEach(t => {
                    if (t.dataset.tab === tabName) t.classList.add('active');
                    else t.classList.remove('active');
                });

                if (tabName === 'terminal') {
                    content.style.padding = '0';
                    try {
                        const res = renderTerminal(content, socket, server);
                        if (typeof res === 'function') cleanup = res;
                    } catch (err) {
                        content.innerHTML = `<div style="padding: 2rem; color: var(--status-error);">Error loading terminal: ${err.message}</div>`;
                    }
                } else if (tabName === 'files') {
                    content.style.padding = '0';
                    try {
                        const res = await renderFileManager(content, socket, server);
                        if (typeof res === 'function') cleanup = res;
                    } catch (err) {
                        content.innerHTML = `<div style="padding: 2rem; color: var(--status-error);">Error loading files: ${err.message}</div>`;
                    }
                } else if (tabName === 'settings') {
                    content.style.padding = '0';
                    const activeNodeVersion = String(server.nodeVersion || '18');
                    const envText = envObjectToText(server.envVars || {});

                    content.innerHTML = `
                        <div class="settings-layout">
                            <section class="settings-card" data-tour-anchor="settings-env">
                                <div class="settings-card-head">
                                    <div>
                                        <h3><i class="fas fa-sliders-h"></i> Server Settings</h3>
                                        <p>Manage runtime values and startup behavior for this instance.</p>
                                    </div>
                                </div>

                                <div class="settings-grid">
                                    <div class="settings-field">
                                        <label>Node Version</label>
                                        <select id="settings-node-version" class="settings-input">
                                            ${SUPPORTED_NODE_VERSIONS.map((version) => `
                                                <option value="${version}" ${version === activeNodeVersion ? 'selected' : ''}>Node.js ${version}</option>
                                            `).join('')}
                                        </select>
                                        <small>Version preference for this server runtime profile.</small>
                                    </div>

                                    <div class="settings-field">
                                        <label>Current Host Runtime</label>
                                        <input class="settings-input" type="text" value="Node.js ${window?.process?.versions?.node || '18.x'}" disabled>
                                    </div>

                                    <div class="settings-field settings-field--full">
                                        <label>Environment Variables</label>
                                        <textarea id="settings-env-vars" class="settings-input settings-textarea" rows="7" placeholder="NODE_ENV=production\nSESSION_NAME=bot_session\nAPI_KEY=your_key">${envText}</textarea>
                                        <small>One per line using KEY=VALUE format.</small>
                                    </div>
                                </div>

                                <div class="settings-actions">
                                    <button class="btn btn-secondary" id="settings-reset-btn"><i class="fas fa-undo"></i> Reset</button>
                                    <button class="btn btn-primary" id="settings-save-btn"><i class="fas fa-save"></i> Save Changes</button>
                                </div>
                            </section>

                            <section class="settings-card settings-card-danger" data-tour-anchor="danger-zone">
                                <div class="settings-card-head">
                                    <div>
                                        <h3><i class="fas fa-exclamation-triangle"></i> Danger Zone</h3>
                                        <p>Destructive actions are permanent. Use with caution.</p>
                                    </div>
                                </div>

                                <div class="danger-row">
                                    <div>
                                        <h4>Delete Server</h4>
                                        <p>Removes this instance and all associated files permanently.</p>
                                    </div>
                                    <button class="btn btn-outline danger-btn">Delete Server</button>
                                </div>
                            </section>
                        </div>
                    `;

                    const nodeVersionInput = content.querySelector('#settings-node-version');
                    const envVarsInput = content.querySelector('#settings-env-vars');
                    const resetBtn = content.querySelector('#settings-reset-btn');
                    const saveBtn = content.querySelector('#settings-save-btn');

                    resetBtn.onclick = () => {
                        nodeVersionInput.value = activeNodeVersion;
                        envVarsInput.value = envText;
                    };

                    saveBtn.onclick = async () => {
                        const originalLabel = saveBtn.innerHTML;
                        saveBtn.disabled = true;
                        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving';

                        try {
                            const envVars = parseEnvTextToObject(envVarsInput.value);
                            const nodeVersion = nodeVersionInput.value;

                            const response = await api.post(`/servers/${id}/settings`, {
                                nodeVersion,
                                envVars
                            });

                            server.nodeVersion = response.settings?.nodeVersion || nodeVersion;
                            server.envVars = response.settings?.envVars || envVars;

                            saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
                            setTimeout(() => {
                                saveBtn.disabled = false;
                                saveBtn.innerHTML = originalLabel;
                            }, 1200);
                        } catch (err) {
                            alert(err.message || 'Failed to save settings');
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = originalLabel;
                        }
                    };
                }
            };

            tabs.forEach(tab => {
                tab.onclick = () => switchTab(tab.dataset.tab);
            });

            // Initial load
            switchTab('terminal');
        };

        render();

    } catch (e) {
        console.error("Cockpit Error:", e);
        container.innerHTML = `
            <div class="page-container">
                ${renderNavbar('servers', null)}
                <main class="main-content">
                    <div class="error-state" style="text-align: center; padding: 4rem;">
                        <h2 style="color: var(--status-error);">Connection Failed</h2>
                        <p>${e.message}</p>
                        <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
                    </div>
                </main>
            </div>
        `;
    }

    return container;
}

function getStatusHelper(status) {
    if (!status) return 'status-offline';
    switch (status.toUpperCase()) {
        case 'RUNNING': return 'status-running';
        case 'STOPPED': return 'status-stopped';
        case 'INSTALLING': return 'status-warning';
        default: return 'status-offline';
    }
}
