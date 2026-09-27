/** Resolve from the actual worker lifecycle: a failed install must not hang forever. */
export async function registerOfflineShell(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
  try {
    // A cached app can start without a network connection. Do not require a HEAD
    // request to rediscover a worker that is already active on this origin.
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active) return true;
    const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    if (registration.active) return true;
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return false;
    return await new Promise<boolean>(resolve => {
      const changed = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          worker.removeEventListener('statechange', changed);
          resolve(worker.state === 'activated');
        }
      };
      worker.addEventListener('statechange', changed);
      changed();
    });
  } catch { return false; }
}
