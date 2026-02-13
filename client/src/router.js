import Dashboard from './pages/Dashboard.js';
import ServerCockpit from './pages/ServerCockpit.js';
import Servers from './pages/Servers.js';
import Auth from './pages/Auth.js';
import Profile from './pages/Profile.js';
import Referrals from './pages/Referrals.js';
import Admin from './pages/Admin.js';

const routes = {
    '/': Dashboard,
    '/dashboard': Dashboard,
    '/servers': Servers,
    '/server/:id': ServerCockpit,
    '/login': Auth,
    '/profile': Profile,
    '/referrals': Referrals,
    '/admin': Admin
};

export const navigate = (path) => {
    document.body.classList.remove('mobile-nav-open');
    window.location.hash = path;
};

export const initRouter = (appDiv, clerk) => {
    const handleRoute = async () => {
        let hash = window.location.hash.slice(1) || '/';
        
        // Strip query params for matching
        const [path, query] = hash.split('?');
        hash = path; // Use path for routing logic

        // Regex for params
        let Component = null;
        let params = {};
        
        console.log(`Routing to: ${hash}`); // Debugging

        if (routes[hash]) {
            Component = routes[hash];
        } else {
             // Match /server/:id
             // Allow slightly broader match for IDs (e.g. underscores)
             const serverMatch = hash.match(/^\/server\/([a-zA-Z0-9-_]+)$/);
             if (serverMatch) {
                 Component = ServerCockpit;
                 params = { id: serverMatch[1] };
             } else {
                 console.warn(`Route not found: ${hash}, handling as 404 (Dashboard)`);
                 Component = Dashboard; // 404
             }
        }

        if (!clerk.user && hash !== '/login') {
            navigate('/login');
            return;
        }

        if (clerk.user && hash === '/login') {
            navigate('/dashboard');
            return;
        }

        appDiv.innerHTML = '';
        const page = await Component(params);
        if (page) appDiv.appendChild(page);
    };

    window.addEventListener('hashchange', handleRoute);
    
    // Global navigation handler for data-link attributes
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('[data-link]');
        if (link) {
            e.preventDefault();
            const path = link.getAttribute('data-link');
            navigate(path);
        }
    });

    handleRoute();
};