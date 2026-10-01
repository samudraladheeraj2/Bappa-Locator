export const CURRENT_APP_VERSION = '1.2.3';
export const CURRENT_VERSION_CODE = 7;

export const VERSION_CHECK_URL =
  'https://raw.githubusercontent.com/samudraladheeraj2/Bappa-Locator/main/version.json';

export interface VersionInfo {
  latestVersion: string;
  versionCode?: number;
  apkUrl: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
  checkedAt: Date;
  error?: string;
}

export function parseSemver(v: string): number[] {
  return (v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

export function isVersionNewer(latest: string, current: string): boolean {
  const [lMaj = 0, lMin = 0, lPat = 0] = parseSemver(latest);
  const [cMaj = 0, cMin = 0, cPat = 0] = parseSemver(current);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function checkForAppUpdates(): Promise<VersionCheckResult> {
  const current = CURRENT_APP_VERSION;
  try {
    let res: Response | null = null;
    try {
      res = await fetchWithTimeout(`${VERSION_CHECK_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    } catch {
      res = null;
    }

    if (!res || !res.ok) {
      try {
        res = await fetchWithTimeout(`/version.json?t=${Date.now()}`, { cache: 'no-cache' });
      } catch {
        res = null;
      }
    }

    if (!res || !res.ok) {
      throw new Error(`Server returned status ${res?.status || 'network error'}`);
    }

    const data: VersionInfo = await res.json();
    const hasUpdate = isVersionNewer(data.latestVersion, current);

    return {
      hasUpdate,
      currentVersion: current,
      latestVersion: data.latestVersion || current,
      apkUrl: data.apkUrl || 'https://github.com/samudraladheeraj2/Bappa-Locator/releases/latest',
      releaseNotes: data.releaseNotes || 'Bug fixes, performance improvements, and real-time database synchronization.',
      forceUpdate: data.forceUpdate,
      checkedAt: new Date(),
    };
  } catch (err: any) {
    console.warn('Update check warning:', err);
    return {
      hasUpdate: false,
      currentVersion: current,
      latestVersion: current,
      apkUrl: 'https://github.com/samudraladheeraj2/Bappa-Locator/releases/latest',
      checkedAt: new Date(),
      error: err.message || 'Unable to check for updates right now.',
    };
  }
}
