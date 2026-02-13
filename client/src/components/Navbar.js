export function renderNavbar(activeLink = 'dashboard', user) {
    const navLinks = `
        <a href="#" class="nav-link ${activeLink === 'dashboard' ? 'active' : ''}" data-link="/dashboard"><i class="fas fa-th-large"></i><span class="nav-link-label">Dashboard</span></a>
        <a href="#" class="nav-link ${activeLink === 'servers' ? 'active' : ''}" data-link="/servers"><i class="fas fa-server"></i><span class="nav-link-label">Servers</span></a>
        <a href="#" class="nav-link ${activeLink === 'referrals' ? 'active' : ''}" data-link="/referrals"><i class="fas fa-gift"></i><span class="nav-link-label">Referrals</span></a>
        ${user?.isAdmin ? `<a href="#" class="nav-link ${activeLink === 'admin' ? 'active' : ''}" data-link="/admin"><i class="fas fa-shield-alt"></i><span class="nav-link-label">Admin</span></a>` : ''}
        <a href="#" class="nav-link ${activeLink === 'profile' ? 'active' : ''}" data-link="/profile"><i class="fas fa-user"></i><span class="nav-link-label">Profile</span></a>
    `;

    return `
    <div class="navbar">
        <div class="nav-left">
            <a href="#" class="nav-logo" data-link="/dashboard">Nodehost</a>
            <div class="nav-links">
                ${navLinks}
            </div>
        </div>
        <div class="nav-right">
            <button class="btn btn-sm btn-secondary nav-mobile-toggle" data-action="toggle-mobile-nav" title="Open menu">
                <i class="fas fa-bars"></i>
            </button>
            <button class="btn btn-sm btn-secondary nav-tour-btn" data-action="start-tour" title="Start guided tour">
                <i class="fas fa-route"></i> Tour
            </button>
            <button class="btn btn-sm btn-secondary nav-support-btn" data-action="open-support" title="Open WhatsApp support channel">
                <i class="fab fa-whatsapp"></i> Support
            </button>
            <button class="btn btn-sm btn-secondary nav-logout-btn" data-action="logout" title="Sign out">
                <i class="fas fa-sign-out-alt"></i> Logout
            </button>
            <span class="nav-badge"><i class="fas fa-coins"></i> ${user ? user.coins : '...'}</span>
            <div class="user-menu" id="user-menu-btn">
                <span class="user-name">${user ? (user.username || 'User') : '...'}</span>
                <div class="user-avatar">${user ? (user.username ? user.username.substring(0,2).toUpperCase() : 'US') : 'US'}</div>
            </div>
        </div>
    </div>
    <div class="mobile-nav-backdrop" data-action="close-mobile-nav"></div>
    <aside class="mobile-sidebar">
        <div class="mobile-sidebar-header">
            <div class="mobile-sidebar-brand">Menu</div>
            <button class="btn btn-sm btn-outline" data-action="close-mobile-nav" title="Close menu">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <nav class="mobile-sidebar-links">
            ${navLinks}
        </nav>
        <div class="mobile-sidebar-footer">
            <button class="btn btn-secondary" data-action="open-support"><i class="fab fa-whatsapp"></i> Support</button>
            <button class="btn btn-secondary" data-action="start-tour"><i class="fas fa-route"></i> Tour</button>
            <button class="btn btn-danger" data-action="logout"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
    </aside>
    `;
}
