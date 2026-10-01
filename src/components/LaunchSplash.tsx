import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  MARK_CHEVRON,
  MARK_CHEVRON_WIDTH,
  MARK_CORNER,
  MARK_HEXAGON,
  MARK_VIEWBOX,
} from "@/lib/brandMark";
import {
  flightBetween,
  isAutomated,
  settled,
  type Box,
  type Flight,
} from "@/lib/launchSplash";

/** The chevron's rise into the hexagon. */
const RISE_S = 0.4;
/** The mark's flight into Home's header, and the overlay's fade. */
const FLIGHT_S = 0.5;
const FADE_S = 0.25;
/** How long to look for Home's header mark once the app is ready. */
const TARGET_WAIT_MS = 1500;
/** Frames the header mark must hold still before the mark lands on it:
 *  the header eases into place, and its last frames move by fractions
 *  of a pixel, so one quiet frame is not proof it has stopped. */
const SETTLED_FRAMES = 3;
/** Past this the overlay leaves whatever the app is doing; the spinner
 *  beneath it says the app is still loading. */
const HOLD_MAX_MS = 10_000;

const box = (r: DOMRect): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/**
 * The launch animation. While the app loads, the iPhone shows the launch
 * image: the mark's hexagon alone (`scripts/art/gen-splash.mjs`).
 * index.html paints the same hexagon at the same size (#boot-splash) until
 * the bundle runs, and this takes over from it:
 *
 *  1. the chevron rises into the hexagon, completing the mark;
 *  2. it waits for the app (auth resolved; on Home, Home's header mark);
 *  3. on Home, the mark shrinks into the header's mark as the overlay
 *     fades and the page shows; anywhere else the overlay just fades.
 *
 * The ground is the launch colour in both themes, as the launch image is,
 * so a light-mode user's page turns light as it is revealed, not under
 * the logo. Reduce Motion: the whole mark from the start and a fade, no
 * rise and no flight. Under automation it never shows (isAutomated).
 * Transform and opacity only, the WKWebView-safe recipe.
 *
 * Decorative and aria-hidden: the app's own "Loading Tropos" status sits
 * beneath it. It never takes a pointer.
 */
export default function LaunchSplash() {
  const [automated] = useState(() =>
    isAutomated(typeof navigator === "undefined" ? undefined : navigator)
  );
  const reduce = useReducedMotion();
  const { user, profile, loading } = useAuth();
  const { pathname } = useLocation();
  const ids = `launch-${useId().replace(/[^\w-]/g, "")}`;
  const markRef = useRef<HTMLDivElement>(null);
  const [risen, setRisen] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [leaving, setLeaving] = useState<{ flight: Flight | null } | null>(
    null
  );
  const [done, setDone] = useState(false);

  // Take over index.html's static first frame, in the same paint.
  useLayoutEffect(() => {
    document.getElementById("boot-splash")?.remove();
    document.documentElement.classList.remove("booting");
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setOverdue(true), HOLD_MAX_MS);
    return () => window.clearTimeout(t);
  }, []);

  const ready = (!loading && (risen || reduce)) || overdue;
  // On Home the overlay waits for Home's header mark, so it reveals the
  // page rather than its loading placeholders, and flies onto that mark
  // (or fades, under Reduce Motion). Anywhere else, or past the hold, it
  // fades once the app is ready.
  const waitForHome =
    !!user && !!profile?.onboardingComplete && pathname === "/" && !overdue;
  const leave = leaving;
  const leavingKind = leave ? (leave.flight ? "flight" : "fade") : null;

  useEffect(() => {
    if (automated || leaving || !ready) return;
    // The decision is taken in a frame callback and then kept, so a later
    // change (a route, a profile) cannot bring the overlay back.
    let raf = 0;
    let last: Box | null = null;
    let still = 0;
    const started = performance.now();
    const look = () => {
      if (!waitForHome) {
        setLeaving({ flight: null });
        return;
      }
      const target = document.querySelector("[data-brand-mark]");
      const mark = markRef.current;
      if (target && mark) {
        const to = box(target.getBoundingClientRect());
        still = to.height > 0 && settled(last, to) ? still + 1 : 0;
        if (still >= SETTLED_FRAMES) {
          const from = box(mark.getBoundingClientRect());
          setLeaving({
            flight: !reduce && from.height > 0 ? flightBetween(from, to) : null,
          });
          return;
        }
        last = to;
      }
      if (performance.now() - started > TARGET_WAIT_MS) {
        setLeaving({ flight: null });
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [automated, leaving, ready, waitForHome, reduce]);

  // While the mark flies, the header's own mark waits under it, so the
  // page never shows two. The overlay ends when its motion has run, on a
  // timer: framer's completion callback can fire as a new target starts,
  // which took the overlay down before the flight had begun. The header's
  // mark comes back first, under the landed one, so no frame shows none.
  useEffect(() => {
    if (!leavingKind) return;
    const root = document.documentElement;
    if (leavingKind === "flight") root.classList.add("launching");
    const t = window.setTimeout(
      () => {
        root.classList.remove("launching");
        setDone(true);
      },
      ((leavingKind === "flight" ? FLIGHT_S : FADE_S) + 0.05) * 1000
    );
    return () => {
      window.clearTimeout(t);
      root.classList.remove("launching");
    };
  }, [leavingKind]);

  if (automated || done) return null;

  const flight = leave?.flight;
  return (
    <div className="launch-splash" aria-hidden="true" data-launch-splash="">
      <motion.div
        className="launch-splash-ground"
        initial={false}
        animate={{ opacity: leave ? 0 : 1 }}
        transition={{
          duration: flight ? FLIGHT_S * 0.6 : FADE_S,
          delay: flight ? FLIGHT_S * 0.2 : 0,
          ease: "linear",
        }}
      />
      <motion.div
        ref={markRef}
        className="relative"
        initial={false}
        animate={
          flight
            ? { x: flight.x, y: flight.y, scale: flight.scale }
            : { opacity: leave ? 0 : 1 }
        }
        transition={
          flight
            ? { duration: FLIGHT_S, ease: [0.65, 0, 0.25, 1] }
            : { duration: FADE_S, ease: "linear" }
        }
      >
        <svg
          className="launch-splash-mark"
          viewBox={MARK_VIEWBOX}
          focusable="false"
        >
          {/* The chevron is a hole, not a shape in some colour: it shows
              the launch ground, then the page as the ground fades, which
              is what Home's mark shows when the flight lands on it. It
              cuts only inside the hexagon's outline while it rises. */}
          <defs>
            <clipPath id={`${ids}-clip`}>
              <polygon points={MARK_HEXAGON} />
            </clipPath>
            <mask id={`${ids}-cut`}>
              <rect width="1024" height="1024" fill="white" />
              <g clipPath={`url(#${ids}-clip)`}>
                <motion.polyline
                  points={MARK_CHEVRON}
                  fill="none"
                  stroke="black"
                  strokeWidth={MARK_CHEVRON_WIDTH}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={reduce ? false : { y: 70, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: RISE_S, ease: [0.2, 0.9, 0.25, 1] }}
                  onAnimationComplete={() => setRisen(true)}
                />
              </g>
            </mask>
          </defs>
          <polygon
            points={MARK_HEXAGON}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={MARK_CORNER}
            strokeLinejoin="round"
            mask={`url(#${ids}-cut)`}
          />
        </svg>
      </motion.div>
    </div>
  );
}
