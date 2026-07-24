import { useSyncExternalStore } from "react";

/**
 * Reactive "is the app in dark mode?" — tracks the `.dark` class on the
 * document root (Settings toggles it at runtime; public/init.js sets it
 * pre-React). Re-renders on theme change via a MutationObserver.
 *
 * The app's dark theme is `.dark`-class-based, NOT Tailwind's media-based
 * `dark:` variant, so components that need to branch on the *app* theme
 * (not the OS preference) must read it this way. Consolidates the
 * subscribe/getSnapshot pattern previously inlined in useMacroPalette and
 * MuscleHeatMap.
 */
function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getIsDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getIsDark, () => false);
}
