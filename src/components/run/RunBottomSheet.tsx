import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useId,
  type ReactNode,
} from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { THEME } from "../../lib/theme";
import { haptic } from "../../lib/haptic";
import { projectAndSnap } from "../../lib/sheetSnap";
import {
  slidingPaceSeconds,
  estimateRunCalories,
  calculateSplits,
} from "../../lib/gps";
import type { GPSPoint } from "../../lib/gps";
import { paceMinSec, distanceValue } from "@/lib/runLabels";
import {
  type DistanceUnit,
  distanceUnitLabel,
  paceUnitLabel,
  lapMetresFor,
  METRES_PER_MILE,
} from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { type ZoneNumber } from "../../lib/hrZones";
import { RunControlButton } from "@/components/ui/RunControlButton";
import HoldToFinishButton from "./HoldToFinishButton";
import { Check } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

// HR zone → colour ramp (cool→hot), all THEME tokens (no hex literals).
// Z1 recovery teal · Z2 easy green · Z3 aerobic amber · Z4 threshold orange ·
// Z5 max coral-red. Below-Z1 / unknown falls back to the muted stat colour.
const ZONE_COLOR: Record<ZoneNumber, string> = {
  1: THEME.teal,
  2: THEME.success,
  3: THEME.amberLight,
  4: THEME.warning,
  5: THEME.danger,
};

interface RunBottomSheetProps {
  elapsed: number;
  distance: number;
  points: GPSPoint[];
  formatTime: (s: number) => string;
  onPause: () => void;
  onLock: () => void;
  isPaused: boolean;
  onResume: () => void;
  onStop: () => void;
  onDiscard?: () => void;
  /* Drives the End-run dialog's primary-action choice. When the live
     run is sub-threshold (the misclick case: tapped Stop at 0:05/0km),
     surface Discard Run as the red primary CTA and demote ending the
     run to a small "End anyway" text link below — defaulting the
     user toward not-saving rather than routing them through the
     summary + InvalidRunReview path. Derived once in Run.tsx via
     getInvalidRunReason; the dialog never re-derives. */
  isInvalid?: boolean;
  intervalDisplay?: ReactNode;
  weightKg: number;
  /**
   * Live heart rate (bpm) and current zone, from useHeartRate. Null until a
   * live HR source streams (no web/native source yet — see heartRateSource.ts),
   * so the HR readout stays hidden rather than showing a placeholder. Wired now
   * so it lights up the moment the HealthKit plugin lands.
   */
  bpm?: number | null;
  hrZone?: 0 | ZoneNumber | null;
  /**
   * Elapsed seconds at the moment the distance goal was reached, or null if
   * there is no goal or it hasn't been hit yet.
   *
   * The run deliberately keeps recording past the goal (announce-and-
   * continue — see `checkGoalReached`), which leaves the runner with no way
   * to know it landed unless something on screen says so. The voice cue
   * can't carry that alone: cues may be off, or there may be no headphones.
   * Apple's goal cue is tone+haptic with no speech at all, so the non-audio
   * channel is the one that has to be complete.
   */
  goalReachedAt?: number | null;
  /** Distance target in metres — labels the goal chip. */
  goalDistanceM?: number;
}

// Visible sheet height as fraction of viewport: compact, mid, full.
// idx 2 = expanded timer view; idx 0 = compact bar (map mostly visible).
const SNAPS: [number, number, number] = [0.13, 0.4, 0.91];
const SHEET_SPRING = { type: "spring" as const, stiffness: 520, damping: 44 };

/* haptic moved to the shared @/lib/haptic implementation in
   W1f, which routes through the Capacitor Haptics plugin in the
   native shell. The old `navigator.vibrate`-only inline was a
   no-op on iOS Safari — the iOS path now fires correctly. */

// ── Current km progress bar ───────────────────────────────────────────────────
function KmProgress({
  distance,
  unit,
}: {
  distance: number;
  unit: DistanceUnit;
}) {
  /* One LAP of the reader's unit, not a hardcoded kilometre — otherwise a
     miles reader gets a bar that fills on a boundary their distance
     readout never shows. */
  const lap = unit === "mi" ? METRES_PER_MILE : 1000;
  const kmDone = Math.floor(distance / lap);
  const progress = (distance % lap) / lap;
  const next = kmDone + 1;
  const u = distanceUnitLabel(unit);
  return (
    <div className="flex items-center gap-2 px-1">
      <p
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.3)",
          width: 28,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {kmDone}
        {u}
      </p>
      <div
        className="flex-1 h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${THEME.teal}, ${THEME.brand})`,
          }}
        />
      </div>
      <p
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.3)",
          width: 28,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {next}
        {u}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RunBottomSheet({
  elapsed,
  distance,
  points,
  formatTime,
  onPause,
  onLock,
  isPaused,
  onResume,
  onStop,
  onDiscard,
  isInvalid = false,
  intervalDisplay,
  weightKg,
  bpm = null,
  hrZone = null,
  goalReachedAt = null,
  goalDistanceM,
}: RunBottomSheetProps) {
  const hrColor =
    hrZone && hrZone >= 1 ? ZONE_COLOR[hrZone] : "rgba(255,255,255,0.65)";
  const unit = useDistanceUnit();
  const [snapIdx, setSnapIdx] = useState<0 | 1 | 2>(2);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const stopTitleId = useId();
  const isExpanded = snapIdx === 2;

  // ── Draggable bottom sheet ────────────────────────────────────────────
  // Was a touchstart→touchend Y-delta wired ONLY to the 36px handle: tiny
  // target, no live feedback, and — with no touch-action — the browser
  // scrolled / rubber-banded the page underneath mid-drag ("it just swipes
  // the page"). Now the WHOLE sheet is a pointer-drag surface that follows
  // the finger and snaps with momentum; touch-action:none stops the page
  // from moving while you drag.
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Sheet `top` in px for each snap (smaller top = taller sheet).
  const snapTops = useMemo(() => SNAPS.map((s) => (1 - s) * vh), [vh]);
  const top = useMotionValue(snapTops[snapIdx]);
  const draggingRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartTop = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velRef = useRef(0);

  // Settle to the active snap when it changes externally (tap-to-expand,
  // keyboard, viewport resize) — never while a drag is in flight.
  useEffect(() => {
    if (draggingRef.current) return;
    const controls = animate(top, snapTops[snapIdx], SHEET_SPRING);
    return () => controls.stop();
  }, [snapIdx, snapTops, top]);

  const onSheetPointerDown = (e: React.PointerEvent) => {
    // Let interactive controls keep their taps — don't hijack into a drag.
    if (
      (e.target as HTMLElement).closest(
        "button,[role='button'],a,input,select,textarea"
      )
    ) {
      return;
    }
    draggingRef.current = true;
    dragStartY.current = e.clientY;
    dragStartTop.current = top.get();
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    velRef.current = 0;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer already released */
    }
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const minTop = snapTops[2];
    const maxTop = snapTops[0];
    const next = Math.max(
      minTop,
      Math.min(maxTop, dragStartTop.current + (e.clientY - dragStartY.current))
    );
    top.set(next);
    const dt = e.timeStamp - lastT.current;
    if (dt > 0) velRef.current = ((e.clientY - lastY.current) / dt) * 1000;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
  };
  const onSheetPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const target = projectAndSnap(top.get(), velRef.current, snapTops) as
      | 0
      | 1
      | 2;
    if (target !== snapIdx) {
      setSnapIdx(target);
      haptic("light");
    } else {
      // Same snap — settle back (the effect won't re-fire: snapIdx unchanged).
      animate(top, snapTops[snapIdx], SHEET_SPRING);
    }
  };

  const pace =
    distance < 10 ? "--:--" : paceMinSec((elapsed / distance) * 1000, unit);
  /* Recent pace over the last KILOMETRE COVERED, not the last 30 seconds.
     The window is anchored to distance so it cannot be dominated by a
     stop: 30 seconds was short enough that a road crossing filled it, and
     this slot read 13:14/km next to an average of 7:05 (owner, on a real
     run). The blank was the same defect — the same window then fell under
     the old `dist < 10` guard and dashed out. See `slidingPaceSeconds`.

     The window follows the READER's unit: a mile runner gets Apple's
     rolling mile, not a kilometre relabelled.

     The all-time average still lags badly once you've banked a few km, so
     it stays the small caption beneath — but it is now ALWAYS shown, not
     only when it disagrees. The post-run summary still records the
     all-time average; that's the right number for the historical entry. */
  const paceWindowM = unit === "mi" ? METRES_PER_MILE : 1000;
  const livePaceS = slidingPaceSeconds(points, paceWindowM);
  const livePace = livePaceS === null ? "--:--" : paceMinSec(livePaceS, unit);
  const calories = estimateRunCalories(distance, weightKg);
  /* Live splits are cut on the READER's lap — a mile runner watching the
     strip wants mile splits, not kilometres relabelled. The SAVED record
     stays metric (Run.tsx uses SPLIT_LAP_IS_METRIC); this is display. */
  const splits = useMemo(
    () => calculateSplits(points, lapMetresFor(unit)),
    [points, unit]
  );
  /* The ONE split worth carrying live. See the strip's obituary above the
     stats pill for why the other N-1 went. */
  const lastSplitPace =
    splits.length > 0 ? splits[splits.length - 1].paceSeconds : null;

  return (
    <>
      {/* Tap map to re-expand */}
      {!isExpanded && (
        <div
          className="fixed inset-0 z-30"
          style={{ bottom: `${SNAPS[snapIdx] * 100}vh` }}
          role="button"
          tabIndex={0}
          aria-label="Expand bottom sheet"
          onClick={() => {
            setSnapIdx(2);
            haptic("light");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setSnapIdx(2);
              haptic("light");
            }
          }}
        />
      )}

      <motion.div
        className="fixed left-0 right-0 bottom-0 z-40 flex flex-col rounded-t-[28px]"
        style={{
          top,
          background: `linear-gradient(180deg, ${THEME.surface} 0%, ${THEME.bg} 100%)`,
          boxShadow: "0 -12px 60px rgba(0,0,0,0.7)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          touchAction: "none",
        }}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
        onPointerCancel={onSheetPointerUp}
      >
        {/* Drag handle — the whole sheet is draggable now, but the handle
            stays as the visible affordance + a keyboard target. */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          role="button"
          tabIndex={0}
          aria-label="Drag to resize the run panel"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && snapIdx < 2) {
              setSnapIdx((s) => (s + 1) as 0 | 1 | 2);
              haptic("light");
            } else if (e.key === "ArrowDown" && snapIdx > 0) {
              setSnapIdx((s) => (s - 1) as 0 | 1 | 2);
              haptic("light");
            }
          }}
        >
          <div
            style={{
              width: 40,
              height: 5,
              borderRadius: 99,
              background: "rgba(255,255,255,0.22)",
            }}
          />
        </div>

        {/* ── EXPANDED VIEW ── */}
        {isExpanded && (
          <div className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
            {/* Primary stats */}
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              {/* Time — hero number */}
              <div className="text-center">
                <p
                  style={{
                    fontSize: 68,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-mono)",
                    color: THEME.teal,
                    lineHeight: 1,
                    letterSpacing: "-2px",
                    textShadow: `0 0 40px ${THEME.teal}55`,
                  }}
                >
                  {formatTime(elapsed)}
                </p>
                <p
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.28)",
                    letterSpacing: "0.12em",
                    marginTop: 4,
                  }}
                >
                  TIME
                </p>
              </div>

              {/* Distance + Pace */}
              <div className="flex gap-12 items-end">
                <div className="text-center">
                  <p
                    style={{
                      fontSize: 46,
                      fontWeight: 700,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1,
                    }}
                  >
                    {distanceValue(distance, unit, 2)}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.28)",
                      letterSpacing: "0.12em",
                      marginTop: 3,
                    }}
                  >
                    {distanceUnitLabel(unit).toUpperCase()}
                  </p>
                </div>
                <div className="text-center">
                  <p
                    style={{
                      fontSize: 46,
                      fontWeight: 700,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1,
                    }}
                  >
                    {livePace}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.28)",
                      letterSpacing: "0.12em",
                      marginTop: 3,
                    }}
                  >
                    {/* Not "LIVE". No reference app labels a pace value
                        that way, and the word promises instantaneity —
                        which is exactly the property that made the number
                        noisy. Naming the window instead ("LAST KM") is what
                        turns a disagreement with AVG from a defect into two
                        differently-scoped readings. */}
                    {paceUnitLabel(unit).toUpperCase()} · LAST{" "}
                    {distanceUnitLabel(unit).toUpperCase()}
                  </p>
                  {/* Shown unconditionally. It used to be gated on
                      `pace !== livePace`, so the average appeared ONLY when
                      it contradicted the number above it and vanished when
                      they agreed — every appearance was a contradiction
                      event, under a 46px number that then reflowed. The
                      average is the stable anchor that makes a recent-pace
                      reading interpretable; it has to be always there to do
                      that job. */}
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.35)",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-mono)",
                      marginTop: 4,
                    }}
                  >
                    AVG {pace}
                  </p>
                </div>
              </div>

              {/* km progress bar */}
              {distance > 0 && <KmProgress distance={distance} unit={unit} />}

              {/* Live splits (last 3) */}
            </div>

            {/* Secondary stats pill */}
            <div
              className="flex items-center justify-around py-3 mb-5 rounded-2xl flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="text-center">
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.65)",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {calories}
                </p>
                <p
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.25)",
                    letterSpacing: "0.1em",
                    marginTop: 2,
                  }}
                >
                  CAL
                </p>
              </div>
              {/* ── LAST KM, replacing ELEV and a SPLITS COUNT ─────────
                  Three cuts, all for the same reason: nothing a runner does
                  mid-run changes because of them.

                  The SPLIT CHIP ROW that used to sit above this pill kept
                  the last three finished splits on screen permanently. Its
                  information value decays to nothing seconds after each
                  split lands, while its screen cost grows with run length —
                  by km 15 it is a wall. 3 of 4 reference apps do not
                  accumulate splits live at all; Garmin fires a lap banner
                  that CLEARS and offers exactly one persistent field,
                  "Last Lap Pace", which is precisely this. The full table is
                  a post-run artefact, and ours already is one.

                  Safe to take away because the split is still ANNOUNCED at
                  the moment it completes — the strongest consensus in the
                  research, 4 of 4 apps, and `audioCues` defaults to on.

                  ELEV: 0 of 4 show live elevation on a road run. Strava
                  scopes it to trail/hike/cycling/winter explicitly. It is a
                  review metric and the summary carries it.

                  SPLITS as a COUNT: no reference app shows one anywhere,
                  and it restated the distance readout three lines above. */}
              <div
                style={{
                  width: 1,
                  height: 28,
                  background: "rgba(255,255,255,0.08)",
                }}
              />
              <div className="text-center">
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.65)",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {lastSplitPace === null
                    ? "--:--"
                    : paceMinSec(lastSplitPace, unit)}
                </p>
                <p
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.25)",
                    letterSpacing: "0.1em",
                    marginTop: 2,
                  }}
                >
                  LAST {distanceUnitLabel(unit).toUpperCase()}
                </p>
              </div>

              {/* HR — only when a live source is streaming (bpm != null). No
                  source yet, so this stays hidden; wired for when one lands. */}
              {bpm != null && (
                <>
                  <div
                    style={{
                      width: 1,
                      height: 28,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                  <div className="text-center">
                    <p
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: hrColor,
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {bpm}
                    </p>
                    <p
                      style={{
                        fontSize: 8,
                        color: "rgba(255,255,255,0.25)",
                        letterSpacing: "0.1em",
                        marginTop: 2,
                      }}
                    >
                      {hrZone && hrZone >= 1 ? `HR Z${hrZone}` : "HR"}
                    </p>
                  </div>
                </>
              )}
            </div>

            {intervalDisplay}

            {/* Goal reached — the visible half of announce-and-continue.
                Sits directly above the controls so the finish affordance
                acquires the emphasis a mid-run modal would have forced;
                the runner ends when they choose, and nothing interrupts
                them if they don't. `aria-live="polite"` because this
                appears exactly once per run, so it cannot become the
                perpetual announcement the exercise-demo phase cue was. */}
            {goalReachedAt !== null && (
              <div
                className="flex justify-center flex-shrink-0"
                aria-live="polite"
              >
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    background: `${THEME.success}1F`,
                    border: `1px solid ${THEME.success}4D`,
                  }}
                >
                  <Check size={13} strokeWidth={3} color={THEME.success} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: THEME.success,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {distanceValue(goalDistanceM ?? 0, unit, 2)}
                    {distanceUnitLabel(unit)} goal · {formatTime(goalReachedAt)}
                  </span>
                </div>
              </div>
            )}

            {/* Sprint 7: controls migrated to <RunControlButton>.
                Each button now carries a compile-time-required
                aria-label so screen readers announce a real action
                name ("Pause run" / "Resume run" / "Stop run" /
                "Lock screen") instead of the empty "button" the
                pre-Sprint-7 code produced. The visible label below
                each button is aria-hidden (decorative) so it isn't
                announced twice. Press scale standardised at 0.92 —
                less playful than the regular Button's 0.97, which
                is the correct posture for an active-run surface
                where the user is moving and eyes are off-screen. */}
            {!isPaused ? (
              <div className="flex items-center justify-center gap-10 flex-shrink-0">
                {/* Lock */}
                <RunControlButton
                  aria-label="Lock screen"
                  label="LOCK"
                  size="sm"
                  variant="neutral"
                  onClick={() => {
                    onLock();
                    haptic("light");
                  }}
                  icon={
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(255,255,255,0.45)"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  }
                />

                {/* Pause — big centre */}
                <RunControlButton
                  aria-label="Pause run"
                  label="PAUSE"
                  size="lg"
                  variant="neutral"
                  onClick={() => {
                    onPause();
                    haptic("medium");
                  }}
                  icon={
                    <div className="flex gap-[7px]">
                      <div
                        style={{
                          width: 11,
                          height: 30,
                          background: "white",
                          borderRadius: 6,
                        }}
                      />
                      <div
                        style={{
                          width: 11,
                          height: 30,
                          background: "white",
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  }
                />

                {/* Hold-to-finish — restores an end affordance to the active
                    state (was Pause→Stop→confirm = 3 taps). Hold ends directly;
                    a tap / keyboard opens the confirm dialog (Discard path). */}
                <HoldToFinishButton
                  onFinish={onStop}
                  onRequestConfirm={() => setShowStopConfirm(true)}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-12 flex-shrink-0">
                <RunControlButton
                  aria-label="Stop run"
                  label="STOP"
                  size="lg"
                  variant="danger"
                  onClick={() => setShowStopConfirm(true)}
                  icon={
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        background: "hsl(var(--destructive))",
                        borderRadius: 5,
                      }}
                    />
                  }
                />

                {/* Resume */}
                <RunControlButton
                  aria-label="Resume run"
                  label="RESUME"
                  size="lg"
                  variant="primary"
                  glow
                  onClick={() => {
                    onResume();
                    haptic("medium");
                  }}
                  icon={
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="white"
                    >
                      <polygon points="6,3 20,12 6,21" />
                    </svg>
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* ── COLLAPSED BAR ── */}
        {!isExpanded && (
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="text-center">
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "white",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatTime(elapsed)}
              </p>
              <p
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.1em",
                }}
              >
                TIME
              </p>
            </div>
            <div className="text-center">
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: THEME.teal,
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {distanceValue(distance, unit, 2)}
              </p>
              <p
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.1em",
                }}
              >
                {distanceUnitLabel(unit).toUpperCase()}
              </p>
            </div>
            <div className="text-center">
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "white",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {livePace}
              </p>
              <p
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.1em",
                }}
              >
                {paceUnitLabel(unit).toUpperCase()}
              </p>
            </div>
            {/* Collapsed-bar toggle stays bespoke at 48px (the primitive's
                sm size is 56px and would push the bar 8px taller). The
                primary fixes Sprint 7 brings here are: required
                aria-label, calmer 0.92 press scale (matching the
                run-surface design-system value), and an explicit
                type="button". */}
            <button
              type="button"
              aria-label={isPaused ? "Resume run" : "Pause run"}
              onClick={() => {
                if (isPaused) {
                  onResume();
                } else {
                  onPause();
                }
                haptic("medium");
              }}
              className="size-12 rounded-full flex items-center justify-center active:scale-[0.92] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{
                background: isPaused ? THEME.teal : "rgba(255,255,255,0.1)",
                border: "2px solid rgba(255,255,255,0.18)",
              }}
            >
              <span aria-hidden="true" className="inline-flex">
                {isPaused ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                ) : (
                  <div className="flex gap-1">
                    <div
                      style={{
                        width: 5,
                        height: 18,
                        background: "white",
                        borderRadius: 3,
                      }}
                    />
                    <div
                      style={{
                        width: 5,
                        height: 18,
                        background: "white",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                )}
              </span>
            </button>
          </div>
        )}
      </motion.div>
      {/* Sprint 3: stop-confirmation migrated onto the shared <Dialog>
          primitive. Pre-Sprint-3 this modal had no escape-to-close
          handler — useFocusTrap was wired but Escape did nothing.
          Dialog adds escape + backdrop dismiss (closeOnBackdrop=false
          here because the dark run surface is intentional and a
          mis-tap on the backdrop shouldn't cancel out of "End run?").
          Bespoke dark surface styling is forwarded via Dialog's
          className prop; the title is rendered inline (not via the
          `title` prop) because the run surface needs white centred
          large text, not the default text-foreground/text-base. */}
      <Dialog
        open={showStopConfirm}
        onClose={() => setShowStopConfirm(false)}
        labelledBy={stopTitleId}
        size="sm"
        role="alertdialog"
        closeOnBackdrop={false}
        className="!bg-transparent !p-0 !shadow-none"
      >
        <div
          className="p-6 rounded-2xl"
          style={{
            background: THEME.surface,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <h3
            id={stopTitleId}
            className="text-lg font-bold text-white text-center mb-4"
          >
            End run?
          </h3>
          <div className="flex justify-around mb-6">
            <div className="text-center">
              <p
                className="text-2xl font-bold font-mono text-white"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {distanceValue(distance, unit, 2)}
              </p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{distanceUnitLabel(unit).toUpperCase()}</p>
            </div>
            <div className="text-center">
              <p
                className="text-2xl font-bold font-mono text-white"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(elapsed)}
              </p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                TIME
              </p>
            </div>
            <div className="text-center">
              <p
                className="text-2xl font-bold font-mono text-white"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {pace}
              </p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>/KM</p>
            </div>
          </div>
          {/* Primary-action swap: for sub-threshold runs the safest
              default is to discard, so Discard Run becomes the red
              CTA and ending the run drops to a small text link
              ("Review anyway"). DOM order matches visual priority
              so VoiceOver reaches the primary action first. The
              link calls onStop() and routes to RunSummary /
              InvalidRunReview — it does NOT save the run, so
              "Save anyway" would lie. "Review anyway" is honest
              about what happens next: the user gets to see the
              summary screen and choose then. */}
          {isInvalid && onDiscard ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowStopConfirm(false);
                  onDiscard();
                }}
                className="w-full py-3.5 rounded-xl font-semibold text-white text-sm"
                style={{ background: "hsl(var(--destructive))" }}
              >
                Discard Run
              </button>
              <button
                type="button"
                onClick={() => setShowStopConfirm(false)}
                className="w-full py-3.5 rounded-xl font-semibold text-sm"
                style={{
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                Keep Going
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStopConfirm(false);
                  onStop();
                }}
                className="w-full py-2 text-xs"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Review anyway
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowStopConfirm(false);
                  onStop();
                }}
                className="w-full py-3.5 rounded-xl font-semibold text-white text-sm"
                style={{ background: "hsl(var(--destructive))" }}
              >
                End Run
              </button>
              {onDiscard && (
                <button
                  type="button"
                  onClick={() => {
                    setShowStopConfirm(false);
                    onDiscard();
                  }}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm"
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  Discard Run
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowStopConfirm(false)}
                className="w-full py-3.5 rounded-xl font-semibold text-sm"
                style={{
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                Keep Going
              </button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
