import { api } from '../services/api.js';
import { renderNavbar } from '../components/Navbar.js';

export default async function Referrals() {
    const container = document.createElement('div');
    container.className = 'page-container';
    
     // Loading
    container.innerHTML = `
        <div class="main-content" style="display: flex; justify-content: center; align-items: center; height: 100vh;">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        const user = await api.get('/users/me');
        const refLink = `${window.location.origin}/?ref=${user.referralCode}`;
        
        const render = () => {
             container.innerHTML = `
                ${renderNavbar('referrals', user)}
                
                 <main class="main-content">
                    <header class="page-header">
                        <div>
                            <h1 class="page-title">Referral Program</h1>
                            <p class="text-muted">Invite friends and earn recurring rewards</p>
                        </div>
                    </header>
                    
                    <div class="stats-grid">
                        <div class="stat-card accent-orange">
                            <div class="stat-icon"><i class="fas fa-coins"></i></div>
                            <div class="stat-value">${user.referralEarnings}</div>
                            <div class="stat-label">Total Earnings</div>
                        </div>
                        <div class="stat-card accent-green">
                            <div class="stat-icon"><i class="fas fa-users"></i></div>
                            <div class="stat-value">${user.referrals.length}</div>
                            <div class="stat-label">Invited Users</div>
                        </div>
                    </div>

                    <div class="grid cols-2" style="margin-top: 2rem;">
                        <div class="card">
                            <h2>Your Referral Link</h2>
                            <p class="text-muted">Share this link to diverse communities.</p>
                            
                            <div style="background: var(--bg-secondary); padding: 1rem; font-family: var(--font-mono); font-size: 1.2rem; margin: 1.5rem 0; border: 1px solid var(--border); border-radius: 4px; text-align: center; color: var(--accent-primary);">
                                ${user.referralCode}
                            </div>
                            
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="text" value="${refLink}" readonly class="input" style="flex: 1; text-align: center;">
                                <button class="btn btn-primary" id="copy-btn"><i class="fas fa-copy"></i> Copy</button>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3><i class="fas fa-info-circle"></i> How it works</h3>
                            <ul style="padding-left: 1.5rem; line-height: 2; margin-top: 1rem; color: var(--text-secondary);">
                                <li>Share your link with friends or on social media.</li>
                                <li>When they sign up, you get <strong class="text-success">15 Coins</strong> instantly.</li>
                                <li>New users get <strong class="text-success">100 Coins</strong> starting bonus.</li>
                                <li>Earn 10% of their coin purchases forever.</li>
                            </ul>
                        </div>
                    </div>
                </main>
            `;
            
            const copyBtn = container.querySelector('#copy-btn');
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(refLink);
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            };
        };

        render();

    } catch(e) {
        container.innerHTML = `<div class="p-4 text-danger">Error: ${e.message}</div>`;
    }

    return container;
}
