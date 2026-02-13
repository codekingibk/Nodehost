export default async function Auth() {
    const currentYear = new Date().getFullYear();
    const container = document.createElement('div');
    // Using inline styles for layout, classes for theme
    container.style.cssText = 'display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background: var(--bg-deep); background-image: radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a0a 100%);';

    container.innerHTML = `
        <div class="glass-panel" style="padding: 3rem; width: 100%; max-width: 480px; border-radius: var(--radius-lg); border: 1px solid var(--border);">
            <div style="text-align: center; margin-bottom: 2rem;">
                <h1 style="font-family: 'Fira Code', monospace; color: var(--accent-primary); margin-bottom: 0.5rem; font-size: 2rem;">
                    <i class="fas fa-cube"></i> NODEHOST
                </h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Deploy. Scale. Conquer.</p>
            </div>
            
            <div id="clerk-bg-fix" style="min-height: 400px; display: flex; justify-content: center;">
                 <div class="loading-spinner"></div>
            </div>
            
            <div style="text-align: center; margin-top: 2rem; color: var(--text-muted); font-size: 0.8rem;">
                &copy; ${currentYear} Nodehost Network
            </div>
        </div>
    `;

    const wrapper = container.querySelector('#clerk-bg-fix');

    // Wait for DOM
    setTimeout(() => {
        if (window.clerk) {
           // We can customize Clerk appearance via the JS object if supported, 
           // but often CSS overrides are needed. 
           // Since we can't easily inject specific CSS into Clerk's iframe/shadow-dom (if used),
           // we just mount it. Clerk normally adopts a light/dark theme based on system or config.
           // Assuming Clerk is configured for dark mode in the dashboard settings or simply blends in.
           
            wrapper.innerHTML = '';
            window.clerk.mountSignIn(wrapper, {
                afterSignInUrl: '/#/dashboard',
                afterSignUpUrl: '/#/dashboard',
                appearance: {
                    baseTheme: 'dark', // Hope this works if @clerk/themes is installed or just standard dark mode trigger
                    variables: {
                        colorPrimary: '#6c5ce7',
                        colorBackground: '#1e1e1e',
                        colorText: '#ffffff'
                    }
                }
            });
        } else {
            wrapper.innerHTML = '<p class="text-danger">Auth Service Unavailable</p>';
        }
    }, 100);

    return container;
}
