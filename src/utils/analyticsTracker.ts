/**
 * GDPR-compliant frontend click & flow tracker.
 *
 * - Zero cookies, zero localStorage/sessionStorage, zero IP/user fingerprinting.
 * - Maintains only the previous step label in volatile JavaScript memory
 *   to measure aggregate user click flows (`from -> target`).
 */

let currentStep: string | null = null;
let lastTrackedTarget = '';
let lastTrackedAt = 0;
let delegatedInitialized = false;
let dailyVisitSent = false;

function sendBeaconOrFetch(endpoint: string, body: string): void {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([body], { type: 'application/json' });
            const queued = navigator.sendBeacon(endpoint, blob);
            if (queued) return;
        }
    } catch {
        // Fallback to fetch below
    }

    if (typeof fetch === 'function') {
        void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => undefined);
    }
}

export function trackDailyVisit(): void {
    if (typeof window === 'undefined' || dailyVisitSent) return;
    if (window.location.pathname.startsWith('/admin')) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    dailyVisitSent = true;
    const body = JSON.stringify({ path: window.location.pathname || '/' });
    sendBeaconOrFetch('/api/visit', body);
}

function sanitizeLabel(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function deriveStepFromLocation(): string {
    if (typeof window === 'undefined') return 'Home';
    const path = window.location.pathname || '/';
    if (path === '/' || path === '') return 'Home';
    if (path.startsWith('/player/') || path.startsWith('/atleta/')) return 'Atleta';
    if (path.startsWith('/campionato/') || path.startsWith('/cam/')) return 'Campionato';
    if (path.startsWith('/regioni/') || path.startsWith('/regione/')) return 'Regioni';
    return sanitizeLabel(path) || 'Home';
}

export function initAnalyticsStep(step?: string): void {
    if (currentStep !== null) return;
    currentStep = sanitizeLabel(step || deriveStepFromLocation()) || 'Home';
}

export function trackClick(
    target: string,
    options?: { updateFlow?: boolean; type?: 'click' | 'page' }
): void {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/admin')) return;

    const cleanTarget = sanitizeLabel(target);
    if (!cleanTarget) return;

    const now = Date.now();
    if (cleanTarget === lastTrackedTarget && now - lastTrackedAt < 150) {
        return;
    }
    lastTrackedTarget = cleanTarget;
    lastTrackedAt = now;

    if (currentStep === null) {
        currentStep = deriveStepFromLocation();
    }

    const fromStep = currentStep;
    if (options?.updateFlow !== false) {
        currentStep = cleanTarget;
    }

    const body = JSON.stringify({
        target: cleanTarget,
        from: fromStep && fromStep !== cleanTarget ? fromStep : undefined,
        type: options?.type === 'page' ? 'page' : 'click',
    });

    sendBeaconOrFetch('/api/click', body);
}

export function initDelegatedClickTracking(): void {
    if (typeof document === 'undefined' || delegatedInitialized) return;
    delegatedInitialized = true;

    document.addEventListener(
        'click',
        (event) => {
            const targetEl = event.target;
            if (!(targetEl instanceof Element)) return;
            const tracked = targetEl.closest<HTMLElement>('[data-track]');
            if (!tracked) return;
            const label = tracked.dataset.track;
            if (!label) return;
            trackClick(label, { updateFlow: tracked.dataset.trackFlow !== 'false' });
        },
        { passive: true }
    );
}

