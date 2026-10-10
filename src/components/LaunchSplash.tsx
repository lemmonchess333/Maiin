import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  flightFrames,
  hexagonClipPath,
  isAutomated,
  settled,
  type Box,
  type Flight,
} from "@/lib/launchSplash";
import { hideNativeLaunchImage } from "@/lib/nativeLaunchImage";

/** The chevron's rise into the hexagon: where it starts (a share of the
 *  mark's height below its place) and how long it climbs. A plain
 *  ease-out, not a sharp one, so the climb is seen and not only the
 *  arrival; it is solid before it slows into place. */
const RISE_FROM = "translateY(11%)";
const RISE_MS = 560;
const RISE_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const RISE_SOLID_MS = 260;
/** Reduce Motion: the chevron fades in where it will stay. */
const APPEAR_MS = 200;
/** Still loading once the mark is whole, it breathes, so a slow start
 *  looks like work rather than a hang. It waits a beat first, so a quick
 *  start never sees it, and eases back to rest as the mark leaves. */
const BREATHE_AFTER_MS = 500;
const BREATH_MS = 1100;
const BREATH_SCALE = 0.95;
const BREATH_EASE = "cubic-bezier(0.37, 0, 0.63, 1)";
const SETTLE_MS = 240;
/** The mark's flight into Home's header. Its timing is in its keyframes
 *  (flightFrames' spring), played linearly. The ground starts to clear a
 *  couple of frames after the mark moves, so the mark leaves solid ground
 *  first. */
const FLIGHT_MS = 500;
const GROUND_AFTER_MS = 40;
const GROUND_MS = 300;
/** Leaving anywhere else, the mark lifts a little as it fades. */
const FADE_MS = 280;
const LIFT_TO = "translateY(-5%)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Once the app is ready, how long the landing waits for Home to say its
 *  content has loaded (`data-page-ready`), so the mark sets down on the
 *  page and not on its loading placeholders. Home's own target for that
 *  is half a second (Home2's render timing), so this only binds on a
 *  slow network, where the page's outline is worth more than a longer
 *  hold: past it, the mark lands on whatever Home has drawn. */
const CONTENT_WAIT_MS = 1000;
/** How long to look for Home's header mark at all; past it the overlay
 *  fades instead. */
const TARGET_WAIT_MS = 1500;
/** Frames the header mark must hold still before the mark lands on it:
 *  the header eases into place, and its last frames move by fractions
 *  of a pixel, so one quiet frame is not proof it has stopped. */
const SETTLED_FRAMES = 3;
/** Past this the overlay leaves whatever the app is doing; the spinner
 *  beneath it says the app is still loading. */
const HOLD_MAX_MS = 10_000;

const HEXAGON_CLIP = hexagonClipPath();

const box = (r: DOMRect): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/** `Element.animate` where there is one. Every browser the app runs in has
 *  it; jsdom does not, and without it the sequence still runs on its
 *  timers, only without the motion. */
function play(
  el: Element | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | null {
  if (!el || typeof el.animate !== "function") return null;
  return el.animate(keyframes, options);
}

type Leaving = { flight: Flight | null; lift: boolean };

/**
 * The launch animation. While the app loads, the phone shows the launch
 * image: the mark's hexagon alone (`scripts/art/gen-splash.mjs`).
 * index.html paints the same hexagon at the same size (#boot-splash) until
 * the bundle runs, and this takes over from it:
 *
 *  1. once its first frame is on screen, the native launch image goes
 *     (it is the same frame), so what follows is seen;
 *  2. the chevron rises into the hexagon, completing the mark;
 *  3. it waits for the app (auth resolved; on Home, Home's header mark
 *     holding still and Home's content loaded), breathing if that is slow;
 *  4. on Home, the mark flies into the header's mark along a soft arc as
 *     the overlay fades and the page shows; anywhere else it lifts away as
 *     the overlay fades.
 *
 * Every movement is a transform or an opacity on an element of its own,
 * played by the Web Animations API, so the browser can run it off the main
 * thread: the rise plays while the bundle is still starting and the flight
 * while Home renders, and neither waits on JavaScript for its frames (the
 * framer-driven version visibly stalled mid-flight). The chevron rises as
 * a shape painted in the launch colour, which reads as a hole on the
 * launch ground, then becomes a real hole for the flight, so it shows the
 * page as the ground fades, which is what Home's mark shows when the
 * flight lands on it.
 *
 * The ground is the launch colour in both themes, as the launch image is,
 * so a light-mode user's page turns light as it is revealed, not under
 * the logo. Reduce Motion: the chevron fades in where it stays, nothing
 * breathes, and the overlay fades, with no rise, lift or flight. Under
 * automation it never shows (isAutomated).
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
  const groundRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);
  const [risen, setRisen] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
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

  // Once the first frame has been drawn, the native launch image can go,
  // and the chevron rises a frame later, in view. Until then the chevron
  // layer is transparent (its CSS), so the frame is the hexagon alone.
  useEffect(() => {
    if (automated || risen) return;
    let raf = 0;
    let timer = 0;
    const motions: (Animation | null)[] = [];
    const nextFrame = (then: () => void) => {
      raf = requestAnimationFrame(then);
    };
    nextFrame(() =>
      nextFrame(() => {
        void hideNativeLaunchImage();
        nextFrame(() => {
          const chevron = chevronRef.current;
          if (reduce) {
            motions.push(
              play(chevron, [{ opacity: 0 }, { opacity: 1 }], {
                duration: APPEAR_MS,
                easing: "linear",
                fill: "forwards",
              })
            );
          } else {
            motions.push(
              play(
                chevron,
                [{ transform: RISE_FROM }, { transform: "translateY(0)" }],
                { duration: RISE_MS, easing: RISE_EASE, fill: "both" }
              ),
              play(chevron, [{ opacity: 0 }, { opacity: 1 }], {
                duration: RISE_SOLID_MS,
                easing: "linear",
                fill: "forwards",
              })
            );
          }
          timer = window.setTimeout(
            () => setRisen(true),
            reduce ? APPEAR_MS : RISE_MS
          );
        });
      })
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      for (const m of motions) m?.cancel();
    };
  }, [automated, risen, reduce]);

  const ready = (!loading && risen) || overdue;
  // On Home the overlay waits for Home's header mark, so it can fly onto
  // it, and for Home's content, so it reveals the page rather than its
  // loading placeholders (or fades, under Reduce Motion). Anywhere else,
  // or past the hold, it fades once the app is ready.
  const waitForHome =
    !!user && !!profile?.onboardingComplete && pathname === "/" && !overdue;

  // A slow start: after a beat, the whole mark breathes until it leaves.
  useEffect(() => {
    if (automated || !risen || leaving || reduce) return;
    const body = bodyRef.current;
    let breath: Animation | null = null;
    const t = window.setTimeout(() => {
      breath = play(
        body,
        [{ transform: "scale(1)" }, { transform: `scale(${BREATH_SCALE})` }],
        {
          duration: BREATH_MS,
          easing: BREATH_EASE,
          iterations: Infinity,
          direction: "alternate",
        }
      );
    }, BREATHE_AFTER_MS);
    return () => {
      window.clearTimeout(t);
      if (!breath || !body) return;
      // Back to rest from wherever the breath had got to, not with a jump.
      // The flight measured the mark at rest, so this has to finish
      // before it lands, and does.
      const now = getComputedStyle(body).transform;
      breath.cancel();
      if (body.isConnected && now && now !== "none") {
        play(body, [{ transform: now }, { transform: "scale(1)" }], {
          duration: SETTLE_MS,
          easing: EASE_OUT,
        });
      }
    };
  }, [automated, risen, leaving, reduce]);

  useEffect(() => {
    if (automated || leaving || !ready) return;
    // The decision is taken in a frame callback and then kept, so a later
    // change (a route, a profile) cannot bring the overlay back.
    let raf = 0;
    let last: Box | null = null;
    let still = 0;
    const started = performance.now();
    const leave = (flight: Flight | null) =>
      setLeaving({ flight, lift: !flight && !reduce });
    const look = () => {
      if (!waitForHome) {
        leave(null);
        return;
      }
      const waited = performance.now() - started;
      const target = document.querySelector("[data-brand-mark]");
      const mark = markRef.current;
      if (target && mark) {
        const to = box(target.getBoundingClientRect());
        still = to.height > 0 && settled(last, to) ? still + 1 : 0;
        last = to;
        const pageReady = document.querySelector("[data-page-ready]") !== null;
        if (
          still >= SETTLED_FRAMES &&
          (pageReady || waited > CONTENT_WAIT_MS)
        ) {
          const from = box(mark.getBoundingClientRect());
          leave(!reduce && from.height > 0 ? flightBetween(from, to) : null);
          return;
        }
      }
      if (waited > TARGET_WAIT_MS) {
        leave(null);
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [automated, leaving, ready, waitForHome, reduce]);

  // While the mark flies, the header's own mark waits under it, so the
  // page never shows two. The overlay ends when its motion has run, on a
  // timer rather than on the animations' own completion, which jsdom and
  // a cancelled animation never report. The header's mark comes back
  // first, under the landed one, so no frame shows none.
  useEffect(() => {
    if (!leaving) return;
    const root = document.documentElement;
    const mark = markRef.current;
    const ground = groundRef.current;
    const motions: (Animation | null)[] = [];
    if (leaving.flight) {
      root.classList.add("launching");
      motions.push(
        play(
          mark,
          flightFrames(leaving.flight).map((transform) => ({ transform })),
          { duration: FLIGHT_MS, easing: "linear", fill: "forwards" }
        ),
        play(ground, [{ opacity: 1 }, { opacity: 0 }], {
          duration: GROUND_MS,
          delay: GROUND_AFTER_MS,
          easing: "linear",
          fill: "both",
        })
      );
    } else {
      motions.push(
        play(
          mark,
          leaving.lift
            ? [
                { opacity: 1, transform: "translateY(0)" },
                { opacity: 0, transform: LIFT_TO },
              ]
            : [{ opacity: 1 }, { opacity: 0 }],
          { duration: FADE_MS, easing: EASE_OUT, fill: "forwards" }
        ),
        play(ground, [{ opacity: 1 }, { opacity: 0 }], {
          duration: FADE_MS,
          easing: "linear",
          fill: "forwards",
        })
      );
    }
    const t = window.setTimeout(
      () => {
        root.classList.remove("launching");
        setDone(true);
      },
      (leaving.flight ? FLIGHT_MS : FADE_MS) + 50
    );
    return () => {
      window.clearTimeout(t);
      root.classList.remove("launching");
      for (const m of motions) m?.cancel();
    };
  }, [leaving]);

  if (automated || done) return null;

  return (
    <div className="launch-splash" aria-hidden="true" data-launch-splash="">
      <div ref={groundRef} className="launch-splash-ground" />
      <div ref={markRef} className="launch-splash-flight">
        <div ref={bodyRef} className="launch-splash-body">
          <svg
            className="launch-splash-mark"
            viewBox={MARK_VIEWBOX}
            focusable="false"
          >
            {/* Once risen, the chevron is a hole, not a shape in some
                colour: it shows the launch ground, then the page as the
                ground fades, which is what Home's mark shows when the
                flight lands on it. */}
            {risen && (
              <defs>
                <mask id={`${ids}-cut`}>
                  <rect width="1024" height="1024" fill="white" />
                  <polyline
                    points={MARK_CHEVRON}
                    fill="none"
                    stroke="black"
                    strokeWidth={MARK_CHEVRON_WIDTH}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </mask>
              </defs>
            )}
            <polygon
              points={MARK_HEXAGON}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={MARK_CORNER}
              strokeLinejoin="round"
              mask={risen ? `url(#${ids}-cut)` : undefined}
            />
          </svg>
          {/* Rising, the chevron is painted in the launch colour, which on
              the launch ground looks the same as the hole it becomes, on a
              layer of its own that the browser can move without
              repainting the mark. It is cut out only inside the hexagon's
              inset outline, so the rim stays whole while it comes up. */}
          {!risen && (
            <div
              className="launch-splash-cut"
              style={{ clipPath: HEXAGON_CLIP }}
            >
              <div ref={chevronRef} className="launch-splash-chevron">
                <svg viewBox={MARK_VIEWBOX} focusable="false">
                  <polyline
                    points={MARK_CHEVRON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={MARK_CHEVRON_WIDTH}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
