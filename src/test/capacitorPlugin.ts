/**
 * A stand-in for a Capacitor plugin as the bridge really makes one: a Proxy
 * that answers EVERY property with a native call, `then` included.
 *
 * That is the trap this exists to keep shut. A promise resolved with a
 * plugin (`return mod.Purchases` from an async function, `.then((m) =>
 * m.Health)`) asks it for `then`, gets a native call, and never settles: on
 * the first TestFlight builds RevenueCat was never set up, App
 * Check never answered, and checkout sat on "Starting checkout…", each with
 * `"Purchases.then()" is not implemented on ios` and its like in the log. A
 * plain object mock has no `then`, so tests of a loader written that way
 * passed. Wrap a plugin mock in this and the same mistake hangs the test.
 *
 * Hold a loaded plugin in an object (`{ plugin }`) instead of resolving with
 * it: haptic.ts, systemChrome.ts and revenuecat.ts show how.
 */
export function capacitorPlugin<T extends object>(methods: T): T {
  return new Proxy(methods, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol") return undefined;
      // The native side rejects the call; the promise that probed `then`
      // waits for a resolve that never comes.
      return () => new Promise(() => {});
    },
  });
}
