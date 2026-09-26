/** A web export without the postbuild worker remains usable online. */
export async function registerOfflineShell(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
  try {
    const response = await fetch('/service-worker.js', { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return false;
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return true;
  } catch { return false; }
}
