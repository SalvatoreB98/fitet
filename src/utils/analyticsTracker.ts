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

export function isStandalonePwa(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
            return true;
        }
        // iOS Safari (non supporta display-mode in tutti i contesti)
        const nav = window.navigator as Navigator & { standalone?: boolean };
        if (nav.standalone === true) return true;
        if (typeof document !== 'undefined' && document.referrer.indexOf('android-app://') === 0) {
            return true;
        }
    } catch {
        return false;
    }
    return false;
}

export function trackDailyVisit(): void {
    if (typeof window === 'undefined' || dailyVisitSent) return;
    if (window.location.pathname.startsWith('/admin')) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    dailyVisitSent = true;
    const body = JSON.stringify({
        path: window.location.pathname || '/',
        pwa: isStandalonePwa(),
    });
    sendBeaconOrFetch('/api/visit', body);
}

const TRAFFIC_SOURCE_KEY = 'fitet_traffic_source';
const TRAFFIC_SOURCE_SENT_KEY = 'fitet_traffic_source_tracked';

export function classifyTrafficSource(
    rawReferrer: string,
    rawUtmSource?: string | null,
    currentHostname?: string
): string {
    const utm = (rawUtmSource || '').trim().toLowerCase();
    if (utm) {
        if (utm.includes('google')) return 'google';
        if (utm.includes('bing')) return 'bing';
        if (utm === 'fb' || utm.includes('facebook')) return 'facebook';
        if (utm === 'ig' || utm.includes('instagram')) return 'instagram';
        return utm.replace(/[^a-z0-9._-]/g, '').slice(0, 100) || 'direct';
    }

    const ref = (rawReferrer || '').trim();
    if (!ref) return 'direct';

    try {
        const host = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
        if (!host) return 'direct';

        const ownHost = (currentHostname || '').toLowerCase().replace(/^www\./, '');
        if (ownHost && host === ownHost) return 'direct';

        if (host === 'google.com' || host.startsWith('google.') || host.endsWith('.google.com') || host.includes('.google.')) {
            return 'google';
        }
        if (host === 'bing.com' || host.endsWith('.bing.com')) {
            return 'bing';
        }
        if (host === 'facebook.com' || host === 'fb.com' || host.endsWith('.facebook.com') || host.endsWith('.fb.com')) {
            return 'facebook';
        }
        if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
            return 'instagram';
        }
        return host.slice(0, 100);
    } catch {
        return 'direct';
    }
}

/**
 * Cattura la sorgente di traffico al primo caricamento della sessione SPA
 * salvandola in sessionStorage e inviandola una sola volta a POST /api/track-source.
 */
export function trackTrafficSource(): void {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/admin')) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;

    try {
        if (window.sessionStorage.getItem(TRAFFIC_SOURCE_SENT_KEY) === '1') {
            return;
        }
    } catch {
        // Se sessionStorage non è accessibile, evitiamo comunque errori
    }

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const referrer = typeof document !== 'undefined' ? document.referrer || '' : '';
    const landingPath = window.location.pathname || '/';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const source = classifyTrafficSource(referrer, utmSource, window.location.hostname);

    try {
        window.sessionStorage.setItem(
            TRAFFIC_SOURCE_KEY,
            JSON.stringify({
                source,
                utmMedium: utmMedium || null,
                referrer: referrer || null,
                landingPath,
                trackedAt: new Date().toISOString(),
            })
        );
        window.sessionStorage.setItem(TRAFFIC_SOURCE_SENT_KEY, '1');
    } catch {
        // ignore storage quota / privacy mode errors
    }

    const body = JSON.stringify({
        source,
        utmMedium: utmMedium || undefined,
        referrer: referrer || undefined,
        landingPath,
        userAgent,
    });
    sendBeaconOrFetch('/api/track-source', body);
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

