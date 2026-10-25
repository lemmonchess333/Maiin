import { useSyncExternalStore } from "react";

/* The theme the app renders is the `dark` class on <html>: auth.tsx sets
   it from the profile (dark unless the person chose light), and init.js
   sets it before the first paint. A surface that reads the class draws
   what is on screen; one that reads `profile.darkMode` draws what the
   profile says, which is not the same thing while the profile loads, or
   when anything else sets the class. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

/** True while the app renders its dark theme, and re-renders when it flips. */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
