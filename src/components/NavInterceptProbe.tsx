/**
 * TEMPORARY diagnostic (2026-07-06) — identifies what element is
 * intercepting taps on the bottom nav in the field, where we can't
 * attach a debugger. Activated ONLY when the URL carries `?debugnav`
 * (persisted to sessionStorage so it survives client navigations);
 * renders nothing otherwise, so it's inert for real users.
 *
 * It polls the Train tab's centre point, hit-tests it with
 * document.elementFromPoint, and if the element on top isn't the nav
 * link it prints the intercepting element's ancestor chain in a fixed
 * banner at the TOP of the screen (away from the nav, pointer-events
 * none so it never itself blocks anything). Remove once the field bug
 * is diagnosed.
 */
import { useEffect, useState } from "react";

function isActive(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("debugnav")
    ) {
      sessionStorage.setItem("tropos-debugnav", "1");
      return true;
    }
    return sessionStorage.getItem("tropos-debugnav") === "1";
  } catch {
    return false;
  }
}

export default function NavInterceptProbe() {
  const [report, setReport] = useState("debugnav: probing…");
  const active = isActive();

  useEffect(() => {
    if (!active) return;
    const describe = (el: Element) =>
      `${el.tagName}${(el as HTMLElement).id ? "#" + (el as HTMLElement).id : ""}.${String(
        el.className
      ).slice(0, 70)}`;
    const tick = () => {
      const a = document.querySelector('nav[data-tab-bar] a[href="/program"]');
      if (!a) {
        setReport("debugnav: no nav link on this page");
        return;
      }
      const r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      if (!hit) {
        setReport("debugnav: nothing at nav point");
        return;
      }
      if (hit.closest("nav[data-tab-bar]")) {
        setReport("debugnav: OK ✓ nav is on top (tappable)");
        return;
      }
      const chain: string[] = [];
      let e: Element | null = hit;
      while (e && chain.length < 5) {
        chain.push(describe(e));
        e = e.parentElement;
      }
      const style = getComputedStyle(hit as HTMLElement);
      setReport(
        `debugnav: BLOCKED by ${chain.join("  <  ")} | z=${style.zIndex} pe=${style.pointerEvents} pos=${style.position}`
      );
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.92)",
        color: "#4ade80",
        fontSize: 11,
        lineHeight: 1.35,
        padding: "6px 8px",
        fontFamily: "monospace",
        pointerEvents: "none",
        wordBreak: "break-all",
      }}
    >
      {report}
    </div>
  );
}
