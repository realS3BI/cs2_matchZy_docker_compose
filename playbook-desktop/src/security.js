export const ORIGIN = 'https://playbook.schlossers.at';
export function trusted(url) {
  try { const parsed = new URL(url); return parsed.origin === ORIGIN && !parsed.username && !parsed.password; }
  catch { return false; }
}
export function loginNavigation(url) {
  try { const parsed = new URL(url); return trusted(url) || parsed.origin === 'https://steamcommunity.com' && !parsed.username && !parsed.password; }
  catch { return false; }
}
