import { api } from '../services/api.js';
import { navigate } from '../router.js';
import { renderNavbar } from '../components/Navbar.js';

export default async function Dashboard() {
    const container = document.createElement('div');
    container.className = 'page-container';

    // Modern Loading State
    container.innerHTML = `
        <div class="main-content" style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">Loading Dashboard...</p>
        </div>
    `;

    try {
        const user = await api.get('/users/me');
        // Check for active servers
        let serverCount = 0;
        try {
             const servers = await api.get('/servers');
             serverCount = servers.length;
        } catch (err) {
            console.warn("Failed to fetch server count", err);
        }
        
        container.innerHTML = `
            ${renderNavbar('dashboard', user)}

            <main class="main-content app-shell">
                <header class="page-header page-hero" style="margin-bottom: 2rem;" id="dashboard-hero">
                    <div>
                        <h1 class="page-title" style="font-size: 2rem; font-weight: 700;">Dashboard</h1>
                        <p class="text-muted">Welcome back, ${user.username}. Here is your account overview.</p>
                    </div>
                </header>

                <!-- Stats Overview -->
                <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;" id="dashboard-stats">
                    
                    <!-- Coins Card -->
                    <div class="stat-card" style="background: var(--bg-card); border: 1px solid var(--border-card); padding: 1.5rem; border-radius: var(--radius-lg); position: relative; overflow: hidden;">
                        <div style="position: absolute; top: -10px; right: -10px; font-size: 5rem; color: var(--accent-primary); opacity: 0.05;"><i class="fas fa-coins"></i></div>
                        <div class="stat-content">
                            <div class="stat-label" style="color: var(--text-muted); font-size: 0.875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Available Balance</div>
                            <div class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: var(--text-bright); margin: 0.5rem 0;">${user.coins}</div>
                            <div style="font-size: 0.875rem; color: var(--accent-green);"><i class="fas fa-arrow-up"></i> Coins ready to use</div>
                        </div>
                    </div>

                    <!-- Servers Card -->
                    <div class="stat-card" style="background: var(--bg-card); border: 1px solid var(--border-card); padding: 1.5rem; border-radius: var(--radius-lg); position: relative; overflow: hidden; cursor: pointer;" id="d-servers-card" data-tour-anchor="servers-card">
                         <div style="position: absolute; top: -10px; right: -10px; font-size: 5rem; color: var(--accent-blue); opacity: 0.05;"><i class="fas fa-server"></i></div>
                        <div class="stat-content">
                            <div class="stat-label" style="color: var(--text-muted); font-size: 0.875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Active Instances</div>
                            <div class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: var(--text-bright); margin: 0.5rem 0;">${serverCount}</div>
                            <div style="font-size: 0.875rem; color: var(--text-dim);">Manage your servers &rarr;</div>
                        </div>
                    </div>

                    <!-- Daily Reward Card -->
                     <button id="daily-claim-btn" class="stat-card" style="background: linear-gradient(135deg, var(--bg-card) 0%, rgba(255,165,0,0.05) 100%); border: 1px solid var(--border-card); padding: 1.5rem; border-radius: var(--radius-lg); text-align: left; position: relative; transition: all 0.3s ease; width: 100%;" data-tour-anchor="daily-claim">
                        <div style="position: absolute; top: 1rem; right: 1rem; color: var(--accent-orange); font-size: 1.5rem;"><i class="fas fa-gift"></i></div>
                        <div class="stat-label" style="color: var(--text-muted); font-size: 0.875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Daily Bonus</div>
                        <div id="daily-timer" class="stat-value" style="font-size: 1.75rem; font-weight: 700; color: var(--text-bright); margin: 0.5rem 0;">Checking...</div>
                        <div id="daily-subtext" style="font-size: 0.875rem; color: var(--text-dim);">Claim your free coins</div>
                    </button>
                </div>

                <!-- Secondary Content Grid -->
                <div class="dashboard-secondary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                    
                    <!-- Quick Actions / News -->
                    <div class="content-card" style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 1.5rem;" id="quick-actions-panel">
                        <h3 style="font-size: 1.1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; margin-bottom: 1rem; color: var(--text-bright);">
                            <i class="fas fa-rocket" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> Quick Actions
                        </h3>
                        <div class="quick-actions-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem;">
                            <button id="qa-new-server" class="quick-action-btn" style="background: var(--bg-app); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); text-align: center; color: var(--text-primary); transition: all 0.2s; cursor: pointer;">
                                <i class="fas fa-plus-circle" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--accent-primary);"></i>
                                New Server (100)
                            </button>
                            <button id="qa-invite" class="quick-action-btn" style="background: var(--bg-app); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); text-align: center; color: var(--text-primary); transition: all 0.2s; cursor: pointer;">
                                <i class="fas fa-user-plus" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--accent-green);"></i>
                                Invite Friends
                            </button>
                            <button id="qa-profile" class="quick-action-btn" style="background: var(--bg-app); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); text-align: center; color: var(--text-primary); transition: all 0.2s; cursor: pointer;">
                                <i class="fas fa-user-cog" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text-muted);"></i>
                                Edit Profile
                            </button>
                                      <button id="qa-support" class="quick-action-btn" style="background: var(--bg-app); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); text-align: center; color: var(--text-primary); transition: all 0.2s; cursor: pointer;" data-tour-anchor="support">
                                          <i class="fab fa-whatsapp" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem; color: #25D366;"></i>
                                Support
                            </button>
                        </div>
                    </div>

                    <!-- System Status Logic (Static for now) -->
                    <div class="content-card" style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 1.5rem;">
                         <h3 style="font-size: 1.1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; margin-bottom: 1rem; color: var(--text-bright);">
                            <i class="fas fa-heartbeat" style="color: var(--accent-pink); margin-right: 0.5rem;"></i> System Status
                        </h3>
                        <div class="status-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                            <span style="color: var(--text-muted);"><i class="fas fa-globe-americas" style="margin-right: 0.5rem;"></i> US Nodes</span>
                            <span class="badge" style="background: rgba(0,255,136,0.1); color: var(--accent-green); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Operational</span>
                        </div>
                        <div class="status-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                            <span style="color: var(--text-muted);"><i class="fas fa-globe-europe" style="margin-right: 0.5rem;"></i> EU Nodes</span>
                            <span class="badge" style="background: rgba(0,255,136,0.1); color: var(--accent-green); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Operational</span>
                        </div>
                        <div class="status-item" style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--text-muted);"><i class="fas fa-calendar-alt" style="margin-right: 0.5rem;"></i> Server Lifecycle</span>
                            <span class="badge" style="background: rgba(0,255,136,0.1); color: var(--accent-green); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Operational</span>
                        </div>

                         <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                             <p style="font-size: 0.8rem; color: var(--text-dim); text-align: center;">NodeHost v2.0.1</p>
                         </div>
                    </div>
                </div>
            </main>
        `;
        
        // Event Listeners
        container.querySelector('#d-servers-card').onclick = () => navigate('/servers');
        container.querySelector('#qa-new-server').onclick = () => navigate('/servers'); 
        container.querySelector('#qa-invite').onclick = () => navigate('/referrals');
        container.querySelector('#qa-profile').onclick = () => navigate('/profile');
        container.querySelector('#qa-support').onclick = () => window.open('https://whatsapp.com/channel/0029Vb84SnvJP21961huU228', '_blank');

        setupDailyClaim(user, container);

    } catch (error) {
        console.error("Dashboard Error:", error);
         container.innerHTML = `
            ${renderNavbar('dashboard', null)}
            <div class="main-content" style="text-align: center; padding: 4rem;">
                <h2 style="color: var(--status-error);">Failed to load dashboard</h2>
                <p>Could not connect to the server.</p>
                <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
            </div>
        `;
    }

    return container;
}

function setupDailyClaim(user, container) {
    const btn = container.querySelector('#daily-claim-btn');
    const timerDisplay = container.querySelector('#daily-timer');
    const subtext = container.querySelector('#daily-subtext');

    if (!btn) return;

    const ONE_DAY = 24 * 60 * 60 * 1000;
    const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim).getTime() : 0;
    const now = Date.now();
    const timeSince = now - lastClaim;

    if (timeSince > ONE_DAY) {
        // Ready to claim
        timerDisplay.innerText = "Claim Now";
        timerDisplay.style.color = "var(--accent-green)";
        subtext.innerText = "+50 Coins";
        
        btn.onclick = async () => {
             try {
                // Prevent double clicks
                btn.style.opacity = '0.7';
                btn.onclick = null;
                
                 const res = await api.post('/users/daily-claim', {});
                 alert(`Success! You received ${res.reward} coins.`);
                 // Reload to update balance UI
                 window.location.reload(); 
             } catch (err) {
                 alert(err.message || "Failed to claim reward");
                 btn.style.opacity = '1';
             }
        };
    } else {
        // Cooldown
        const timeLeft = ONE_DAY - timeSince;
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        
        timerDisplay.innerText = `${hours}h ${minutes}m`;
        subtext.innerText = "Next Reward In";
        btn.style.cursor = "default";
        
        // Remove hover effects via inline style reset
        btn.style.background = "var(--bg-card)"; 
        btn.style.transform = "none";
    }
}
