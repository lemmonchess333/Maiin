/**
 * The part of the screen a guide card can use: below the status bar's
 * occluder, and above the tab bar when the page has one. A full-screen
 * view (the workout, the run screen) covers the tab bar, so its hints
 * use the whole height instead.
 */
export function screenBand(): { top: number; bottom: number } {
  const occluder = document.querySelector(".ds-safe-top-occluder");
  const nav = document.querySelector("nav[data-tab-bar]");
  return {
    top: occluder ? occluder.getBoundingClientRect().bottom : 0,
    bottom: nav ? nav.getBoundingClientRect().top : window.innerHeight,
  };
}
