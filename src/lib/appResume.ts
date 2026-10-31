/**
 * Calls back each time the person comes back to the app: the page shown
 * again or focused on the web, and the app made active on a phone, where a
 * WKWebView does not always report the page as shown.
 */
export function onAppResume(callback: () => void): () => void {
  let active = true;
  const check = () => {
    if (active && document.visibilityState !== "hidden") callback();
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
  let removeNative: (() => void) | undefined;
  void import("@capacitor/core")
    .then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      const listener = await App.addListener(
        "appStateChange",
        ({ isActive }) => {
          if (isActive) check();
        }
      );
      if (!active) void listener.remove();
      else removeNative = () => void listener.remove();
    })
    .catch(() => {});
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", check);
    window.removeEventListener("focus", check);
    removeNative?.();
  };
}
