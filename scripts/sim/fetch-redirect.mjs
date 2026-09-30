// Preload (node --import) for the live scripts when they run against the LOCAL SIMULATION.
// Rewrites requests for the configured *.supabase.co host to the simulator on 127.0.0.1, so the
// scripts run byte-for-byte unmodified. Not used against a real project.
const publicHost = process.env.SIM_PUBLIC_HOST;
const target = new URL(process.env.SIM_ORIGIN);
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href);
  if (url.host === publicHost) { url.protocol = target.protocol; url.host = target.host; return realFetch(url.href, init); }
  return realFetch(input, init);
};

// Optional accelerated clock: the live deletion script really waits ~5 minutes for a password proof to
// go stale. With SIM_CLOCK_ADVANCE=1 the wait is skipped by advancing BOTH this process's clock and the
// simulator's clock by the same amount, so token ages stay consistent. Only the script's own `sleep`
// (whose callback is a native promise-resolve function) is fast-forwarded; request-abort timers never are.
if (process.env.SIM_CLOCK_ADVANCE === '1') {
  let offset = 0;
  const realNow = Date.now.bind(Date), realSetTimeout = globalThis.setTimeout.bind(globalThis);
  Date.now = () => realNow() + offset;
  globalThis.setTimeout = (callback, ms, ...args) => {
    const native = typeof callback === 'function' && /\[native code\]/.test(Function.prototype.toString.call(callback));
    if (native && typeof ms === 'number' && ms >= 30_000) {
      realFetch(`${target.origin}/__sim/advance-clock`, { method: 'POST', body: JSON.stringify({ ms }) })
        .then(() => { offset += ms; realSetTimeout(callback, 0, ...args); });
      return { ref() { return this; }, unref() { return this; }, hasRef: () => true, refresh() { return this; }, [Symbol.toPrimitive]: () => 0 };
    }
    return realSetTimeout(callback, ms, ...args);
  };
}
