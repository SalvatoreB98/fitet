/**
 * Parser leggero e senza dipendenze per classificare l'User-Agent in
 * dispositivo, sistema operativo e browser.
 *
 * Non salva mai la stringa UA originale: restituisce solo etichette aggregate,
 * coerenti con l'approccio GDPR-compliant dell'analytics.
 */

export type DeviceType = 'Desktop' | 'Mobile' | 'Tablet' | 'TV' | 'Altro';
export type OperatingSystem =
  | 'Windows'
  | 'Android'
  | 'iOS'
  | 'iPadOS'
  | 'macOS'
  | 'ChromeOS'
  | 'Linux'
  | 'Altro';
export type BrowserName =
  | 'Chrome'
  | 'Safari'
  | 'Edge'
  | 'Firefox'
  | 'Samsung Internet'
  | 'Opera'
  | 'Android WebView'
  | 'Altro';

export interface ParsedUserAgent {
  device: DeviceType;
  os: OperatingSystem;
  browser: BrowserName;
}

export function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent || '';
  if (!ua) return 'Altro';

  if (/SmartTV|SMART-TV|Tizen|Web0S|WebOS|AppleTV|HbbTV|NetCast/i.test(ua)) {
    return 'TV';
  }
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) {
    return 'Tablet';
  }
  // Android senza "Mobile" è quasi sempre un tablet
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) {
    return 'Tablet';
  }
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|Opera Mini/i.test(ua)) {
    return 'Mobile';
  }
  if (/Windows NT|Macintosh|X11|CrOS|Linux/i.test(ua)) {
    return 'Desktop';
  }
  return 'Altro';
}

export function detectOperatingSystem(userAgent: string): OperatingSystem {
  const ua = userAgent || '';
  if (!ua) return 'Altro';

  // Ordine importante: Android prima di Linux, iOS/iPadOS prima di macOS
  if (/iPad/i.test(ua)) return 'iPadOS';
  if (/iPhone|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows Phone/i.test(ua)) return 'Altro';
  if (/Windows NT|Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux|X11/i.test(ua)) return 'Linux';
  return 'Altro';
}

export function detectBrowser(userAgent: string): BrowserName {
  const ua = userAgent || '';
  if (!ua) return 'Altro';

  // WebView Android prima di Chrome (contiene "Chrome")
  if (/(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)/i.test(ua)) return 'Altro';
  if (/; wv\)/i.test(ua) || /Version\/[\d.]+.*Chrome\/[\d.]+ Mobile Safari/i.test(ua)) {
    return 'Android WebView';
  }
  if (/EdgA?\//i.test(ua) || /Edge\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera Mini|Opera Mobi|\bOpera\b/i.test(ua)) return 'Opera';
  if (/SamsungBrowser\//i.test(ua)) return 'Samsung Internet';
  if (/FxiOS\/|Firefox\//i.test(ua)) return 'Firefox';
  if (/CriOS\/|Chrome\/|Chromium\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Altro';
}

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  const ua = userAgent || '';
  if (!ua) {
    return { device: 'Altro', os: 'Altro', browser: 'Altro' };
  }
  return {
    device: detectDeviceType(ua),
    os: detectOperatingSystem(ua),
    browser: detectBrowser(ua),
  };
}
