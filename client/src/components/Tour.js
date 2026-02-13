const TOUR_STORAGE_KEY = 'nodehost_tour_seen_v1';

const tourStepsByRoute = {
    '/dashboard': [
        {
            selector: '.nav-tour-btn',
            title: 'Guided Tour',
            body: 'Use this button anytime to replay the tour.'
        },
        {
            selector: '#d-servers-card',
            title: 'Server Overview',
            body: 'This card shows your active instances. Click it to jump into server management.'
        },
        {
            selector: '#daily-claim-btn',
            title: 'Daily Reward',
            body: 'Claim free coins every day to keep your balance topped up.'
        },
        {
            selector: '#qa-support',
            title: 'WhatsApp Support',
            body: 'Reach support instantly through your WhatsApp channel.'
        }
    ],
    '/servers': [
        {
            selector: '#create-server-btn',
            title: 'Create Instance',
            body: 'Deploy a new instance from here in one click.'
        },
        {
            selector: '.server-grid',
            title: 'Instances Grid',
            body: 'All your servers appear here. Click any card to open its cockpit.'
        }
    ],
    '/server/:id': [
        {
            selector: '.cockpit-tabs',
            title: 'Cockpit Tabs',
            body: 'Switch between Console, Files, and Settings.'
        },
        {
            selector: '.terminal-startup-bar',
            title: 'Safe Startup Flow',
            body: 'Edit startup command (npm start + entry), then the system runs install + start safely.'
        },
        {
            selector: '.terminal-input-area',
            title: 'Interactive Input',
            body: 'Input unlocks only after startup completes, so users can only send bot prompts.'
        }
    ]
};

const normalizeRoute = () => {
    const raw = (window.location.hash.slice(1) || '/dashboard').split('?')[0];
    if (/^\/server\/[a-zA-Z0-9-_]+$/.test(raw)) {
        return '/server/:id';
    }
    return raw;
};

const isElementActuallyVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
};

const getVisibleSteps = (route) => {
    const steps = tourStepsByRoute[route] || [];
    return steps.filter((step) => {
        const target = document.querySelector(step.selector);
        return isElementActuallyVisible(target);
    });
};

export const startSiteTour = ({ auto = false } = {}) => {
    document.body.classList.remove('mobile-nav-open');

    if (auto && localStorage.getItem(TOUR_STORAGE_KEY) === 'true') {
        return false;
    }

    const route = normalizeRoute();
    const steps = getVisibleSteps(route);
    if (!steps.length) {
        return false;
    }

    const previous = document.querySelector('.tour-overlay');
    if (previous) {
        previous.remove();
        document.querySelector('.tour-popover')?.remove();
        document.querySelector('.tour-highlight')?.remove();
    }

    let currentIndex = 0;

    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';

    const highlight = document.createElement('div');
    highlight.className = 'tour-highlight';

    const popover = document.createElement('div');
    popover.className = 'tour-popover';
    popover.innerHTML = `
        <div class="tour-meta" id="tour-meta"></div>
        <h3 id="tour-title"></h3>
        <p id="tour-body"></p>
        <div class="tour-actions">
            <button class="btn btn-sm btn-secondary" id="tour-prev">Back</button>
            <button class="btn btn-sm btn-primary" id="tour-next">Next</button>
            <button class="btn btn-sm btn-outline" id="tour-skip">Skip</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(highlight);
    document.body.appendChild(popover);

    const titleEl = popover.querySelector('#tour-title');
    const bodyEl = popover.querySelector('#tour-body');
    const metaEl = popover.querySelector('#tour-meta');
    const prevBtn = popover.querySelector('#tour-prev');
    const nextBtn = popover.querySelector('#tour-next');
    const skipBtn = popover.querySelector('#tour-skip');

    const cleanup = () => {
        overlay.remove();
        highlight.remove();
        popover.remove();
        window.removeEventListener('resize', renderStep);
        window.removeEventListener('scroll', renderStep, true);
    };

    const setPopoverPosition = (rect) => {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            popover.classList.add('tour-popover-mobile');
            popover.style.top = 'auto';
            popover.style.left = '12px';
            popover.style.right = '12px';
            popover.style.bottom = '12px';
            return;
        }

        popover.classList.remove('tour-popover-mobile');
        popover.style.right = '';
        popover.style.bottom = '';

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const popRect = popover.getBoundingClientRect();

        let top = rect.bottom + 12;
        let left = rect.left;

        if (top + popRect.height > viewportHeight - 12) {
            top = rect.top - popRect.height - 12;
        }

        if (left + popRect.width > viewportWidth - 12) {
            left = viewportWidth - popRect.width - 12;
        }

        if (left < 12) left = 12;
        if (top < 12) top = 12;

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
    };

    function renderStep() {
        const step = steps[currentIndex];
        const target = document.querySelector(step.selector);

        if (!target) {
            if (currentIndex < steps.length - 1) {
                currentIndex += 1;
                renderStep();
            } else {
                cleanup();
            }
            return;
        }

        const isMobile = window.innerWidth <= 768;
        target.scrollIntoView({ behavior: isMobile ? 'auto' : 'smooth', block: isMobile ? 'nearest' : 'center' });

        const rect = target.getBoundingClientRect();

        if (isMobile) {
            highlight.style.top = `${Math.max(6, rect.top - 4)}px`;
            highlight.style.left = `${Math.max(6, rect.left - 4)}px`;
            highlight.style.width = `${Math.min(window.innerWidth - 12, rect.width + 8)}px`;
            highlight.style.height = `${Math.min(window.innerHeight * 0.45, rect.height + 8)}px`;
        } else {
            highlight.style.top = `${rect.top - 6}px`;
            highlight.style.left = `${rect.left - 6}px`;
            highlight.style.width = `${rect.width + 12}px`;
            highlight.style.height = `${rect.height + 12}px`;
        }

        titleEl.textContent = step.title;
        bodyEl.textContent = step.body;
        metaEl.textContent = `Step ${currentIndex + 1} of ${steps.length}`;

        prevBtn.disabled = currentIndex === 0;
        nextBtn.textContent = currentIndex === steps.length - 1 ? 'Finish' : 'Next';

        requestAnimationFrame(() => setPopoverPosition(rect));
    }

    prevBtn.onclick = () => {
        if (currentIndex > 0) {
            currentIndex -= 1;
            renderStep();
        }
    };

    nextBtn.onclick = () => {
        if (currentIndex < steps.length - 1) {
            currentIndex += 1;
            renderStep();
            return;
        }

        localStorage.setItem(TOUR_STORAGE_KEY, 'true');
        cleanup();
    };

    skipBtn.onclick = cleanup;
    overlay.onclick = cleanup;

    window.addEventListener('resize', renderStep);
    window.addEventListener('scroll', renderStep, true);

    renderStep();
    return true;
};

export const initTourSystem = () => {
    window.startSiteTour = startSiteTour;
};
