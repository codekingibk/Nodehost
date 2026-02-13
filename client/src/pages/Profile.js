import { api } from '../services/api.js';
import { renderNavbar } from '../components/Navbar.js';
import { navigate } from '../router.js';

export default async function Profile() {
    const container = document.createElement('div');
    container.className = 'page-container';
    
    // Loading
    container.innerHTML = `
        <div class="main-content" style="display: flex; justify-content: center; align-items: center; height: 100vh;">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        const clerkUser = window.clerk?.user || null;
        const [user, transactions] = await Promise.all([
             api.get('/users/me'),
             api.get('/users/transactions')
        ]);

        const displayName = clerkUser?.fullName || clerkUser?.username || user.username || 'User';
        const displayEmail = clerkUser?.primaryEmailAddress?.emailAddress || user.email || 'No email';
        const displayInitials = displayName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join('') || 'US';
        const avatarUrl = clerkUser?.imageUrl || '';

        const render = () => {
            container.innerHTML = `
                ${renderNavbar('profile', user)}
                
                <main class="main-content">
                    <header class="page-header">
                        <div>
                            <h1 class="page-title">User Profile</h1>
                            <p class="text-muted">Manage your account settings and billing</p>
                        </div>
                    </header>
                    
                    <div class="grid cols-3" style="margin-bottom: 2rem;">
                         <div class="card" style="grid-column: span 1;">
                            <div style="text-align: center; padding: 2rem 0;">
                                ${avatarUrl
                                    ? `<img src="${avatarUrl}" alt="Profile avatar" style="width: 84px; height: 84px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); margin: 0 auto 1rem auto; display:block;">`
                                    : `<div class="user-avatar" style="width: 80px; height: 80px; font-size: 2rem; margin: 0 auto 1rem auto;">${displayInitials}</div>`}
                                <h2>${displayName}</h2>
                                <p class="text-muted">${displayEmail}</p>
                                <span class="badge" style="background: rgba(108, 92, 231, 0.2); color: var(--accent-primary); margin-top: 1rem; display: inline-block;">
                                    User
                                </span>
                            </div>
                         </div>
                         
                         <div class="card" style="grid-column: span 2;">
                            <h3>Account Details</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                                <div>
                                    <label class="text-muted" style="font-size: 0.8rem;">Clerk ID</label>
                                    <div style="font-family: var(--font-mono); background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px;">${user.clerkId}</div>
                                </div>
                                <div>
                                    <label class="text-muted" style="font-size: 0.8rem;">Username</label>
                                    <div style="font-family: var(--font-mono); background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px;">${user.username || '-'}</div>
                                </div>
                                <div>
                                    <label class="text-muted" style="font-size: 0.8rem;">Joined At</label>
                                    <div style="font-family: var(--font-mono); background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px;">${new Date(user.joinedAt).toLocaleDateString()}</div>
                                </div>
                                <div style="grid-column: span 2;">
                                    <label class="text-muted" style="font-size: 0.8rem;">Referral Code</label>
                                    <div style="font-family: var(--font-mono); background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px;">${user.referralCode}</div>
                                </div>
                            </div>
                            
                            <div style="margin-top: 2rem; text-align: right;">
                                <button class="btn btn-danger" id="logout-btn"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
                            </div>
                         </div>
                    </div>

                    <h2 class="section-title"><i class="fas fa-history"></i> Transaction History</h2>
                    <div class="card" style="padding: 0; overflow: hidden;">
                        <table style="width: 100%; text-align: left; border-collapse: collapse;">
                            <thead style="background: var(--bg-secondary);">
                                <tr>
                                    <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase;">Date</th>
                                    <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase;">Type</th>
                                    <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase;">Amount</th>
                                    <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase;">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${transactions.map(t => `
                                    <tr style="border-bottom: 1px solid var(--border);">
                                        <td style="padding: 1rem; font-family: var(--font-mono); font-size: 0.9rem;">${new Date(t.timestamp).toLocaleDateString()}</td>
                                        <td style="padding: 1rem;">${t.type}</td>
                                        <td style="padding: 1rem; font-weight: bold;" class="${t.amount > 0 ? 'text-success' : 'text-danger'}">${t.amount > 0 ? '+' : ''}${t.amount}</td>
                                        <td style="padding: 1rem; font-family: var(--font-mono);">${t.balance}</td>
                                    </tr>
                                `).join('')}
                                ${transactions.length === 0 ? '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No transactions found</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </main>
            `;

            container.querySelector('#logout-btn').onclick = async () => {
                await window.clerk.signOut();
                window.location.reload();
            };
        };
        
        render();

    } catch(e) {
         container.innerHTML = `<div class="p-4 text-danger">Error: ${e.message}</div>`;
    }

    return container;
}
