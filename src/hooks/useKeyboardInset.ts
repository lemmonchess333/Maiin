import { useEffect, useState } from "react";

/**
 * The number of pixels the on-screen keyboard currently overlaps the bottom of
 * the layout viewport — 0 when no keyboard is shown.
 *
 * Bottom sheets are fixed to `bottom: 0`, so when a soft keyboard opens it
 * covers the sheet's lower region (and any input pinned there). Reserving this
 * many pixels of bottom padding lifts the sheet's content above the keyboard.
 *
 * Uses the `visualViewport` API, which mobile browsers (and Android WKWebView)
 * shrink when the keyboard appears. iOS native WKWebView does NOT resize the
 * visual viewport on keyboard show — that path needs the `@capacitor/keyboard`
 * plugin's `keyboardWillShow` height (a follow-up); this hook is the web +
 * Android half and no-ops where `visualViewport` is absent.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Layout-viewport bottom minus visual-viewport bottom = the region
      // hidden behind the keyboard (and any browser UI the visual viewport
      // excludes). Clamp to 0 so a taller visual viewport never yields a
      // negative pad.
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(overlap > 0 ? Math.round(overlap) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
