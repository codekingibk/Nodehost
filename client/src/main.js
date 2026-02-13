import Clerk from '@clerk/clerk-js';
import { initRouter } from './router.js';
import { setTokenProvider, api } from './services/api.js';
import { initTourSystem } from './components/Tour.js';
import './styles/main.css';

const pubKey = 'pk_test_d2FybS1oZW4tNi5jbGVyay5hY2NvdW50cy5kZXYk';

const showSupportPrompt = () => {
    const existing = document.getElementById('support-follow-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'support-follow-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 460px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.5rem;">
                <h3 style="display:flex; align-items:center; gap:8px;"><i class="fab fa-whatsapp" style="color:#25D366;"></i> Support NodeHost</h3>
                <button id="support-follow-close" class="btn btn-sm btn-outline">Close</button>
            </div>
            <p class="text-muted" style="margin-bottom: 1rem;">Help us grow by following our WhatsApp channel for updates, fixes, and announcements.</p>
            <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                <button id="support-follow-later" class="btn btn-secondary">Maybe Later</button>
                <button id="support-follow-now" class="btn btn-primary"><i class="fab fa-whatsapp"></i> Follow Channel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#support-follow-close').onclick = close;
    modal.querySelector('#support-follow-later').onclick = close;
    modal.querySelector('#support-follow-now').onclick = () => {
        window.open('https://whatsapp.com/channel/0029Vb84SnvJP21961huU228', '_blank');
        close();
    };
    modal.onclick = (event) => {
        if (event.target === modal) close();
    };
};

async function main() {
    const clerk = new Clerk(pubKey);
    await clerk.load();
    window.clerk = clerk;

    const appDiv = document.getElementById('app');

    if (clerk.user) {
        setTokenProvider(() => clerk.session.getToken());
        
        // Sync user on load
        try {
            // Check for referral code in localStorage (set during sign-up flow or earlier)
            const refCode = localStorage.getItem('referralCode');
            const primaryEmail = clerk.user.primaryEmailAddress?.emailAddress || '';
            const preferredUsername = clerk.user.username || clerk.user.fullName || primaryEmail.split('@')[0] || 'user';
            const data = { 
                email: primaryEmail,
                username: preferredUsername,
                referralCode: refCode
            };
            await api.post('/users/sync', data);
            if (refCode) localStorage.removeItem('referralCode'); // Consumed
        } catch (e) {
            console.error('User sync failed', e);
        }
    } else {
        // Capture referral from URL if present (e.g. ?ref=somecode)
        // Hash router might make this tricky if it's #/login?ref=...
        // Assuming search params on the main URL before hash
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            localStorage.setItem('referralCode', ref);
        }
    }

    initTourSystem();

    document.body.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action]');
        if (!trigger) return;

        const action = trigger.getAttribute('data-action');
        if (action === 'start-tour') {
            event.preventDefault();
            document.body.classList.remove('mobile-nav-open');
            if (window.startSiteTour) {
                window.startSiteTour();
            }
        }

        if (action === 'open-support') {
            event.preventDefault();
            window.open('https://whatsapp.com/channel/0029Vb84SnvJP21961huU228', '_blank');
        }

        if (action === 'toggle-mobile-nav') {
            event.preventDefault();
            document.body.classList.toggle('mobile-nav-open');
        }

        if (action === 'close-mobile-nav') {
            event.preventDefault();
            document.body.classList.remove('mobile-nav-open');
        }

        if (action === 'logout') {
            event.preventDefault();
            if (window.clerk) {
                window.clerk.signOut().then(() => {
                    window.location.hash = '/login';
                    window.location.reload();
                });
            }
        }
    });

    initRouter(appDiv, clerk);

    if (clerk.user) {
        const activeSessionId = clerk.session?.id || 'default';
        const supportPromptKey = `support_prompt_seen_${activeSessionId}`;
        if (!localStorage.getItem(supportPromptKey)) {
            setTimeout(() => {
                showSupportPrompt();
                localStorage.setItem(supportPromptKey, 'true');
            }, 1200);
        }

        setTimeout(() => {
            if (window.startSiteTour) {
                window.startSiteTour({ auto: true });
            }
        }, 800);
    }
}

main();