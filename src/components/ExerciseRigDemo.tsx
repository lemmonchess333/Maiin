import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  getBodyDemo,
  getFormBeats,
  renderBodyDemo,
  type FormBeat,
} from "@/lib/bodyRig";
import {
  CYCLE_MS_DEFAULT,
  cycleSampleAt,
  placardSampleAt,
  PLACARD_TIMING,
  repTimingFor,
  repSampleLoopedAt,
  type RepPhase,
  type RepStart,
} from "@/lib/exerciseTempo";

const FPS_INTERVAL = 1000 / 30;

/**
 * The figure div, isolated from the player's React re-renders.
 *
 * The one-frame "spaz" (owner device recording, 2026-09-02): the cue
 * line is React state, so every PHASE change re-rendered the player,
 * and the figure div carried `dangerouslySetInnerHTML={{ __html }}` as
 * a fresh object literal. React 19 re-applies that prop whenever its
 * identity changes — it does not compare the strings — so each phase
 * change overwrote the live frame with the INITIAL lockout SVG until the
 * next rAF tick drew over it: a lockout pose flashing for a frame or two,
 * four times per rep, on every demo.
 *
 * Two layers of defence, either sufficient alone: the html prop is a
 * memoised object (same identity → React skips the prop entirely), and
 * the div lives in a memo'd child with stable props (the parent's
 * re-render never reaches it). After the mount paint, only the rAF loop
 * ever writes this div's innerHTML.
 */
const Figure = memo(function Figure({
  html,
  figureRef,
}: {
  html: { __html: string };
  figureRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={figureRef}
      className="mx-auto max-w-[190px]"
      dangerouslySetInnerHTML={html}
    />
  );
});

/* ── The placard's own furniture ─────────────────────────────────────
 *
 * A stepped demo carries reading content on the stage, which the rep
 * player never did: a muscle key, a position name, and its cue. All of
 * it takes the fixed-dark stage's own text tokens — `--muted-foreground`
 * is tuned for the card/muted/page surfaces and measures 3.62:1 on this
 * near-black in the light theme.
 */

const lerpT = (a: number, b: number, k: number) => a + (b - a) * k;
const smoothK = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** A supplied frame's path, against the app's base URL (the build is
 *  served from `/Maiin/` on Pages and `/` on Hosting). */
const frameUrl = (p: string) =>
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/${p.replace(/^\//, "")}`;

/**
 * The supplied frames, crossfading.
 *
 * All of them are in the DOM from the first paint at zero opacity, so
 * the browser has fetched every one before it is needed — a src swap
 * would show the gap on the first pass through the sequence, which is
 * the pass that matters.
 *
 * The fade is a CSS transition on a beat change rather than a per-frame
 * opacity written from the rAF loop: there is nothing to interpolate
 * between two photographs, so the loop's job here is only to say which
 * position is current.
 */
const PlacardFrames = memo(function PlacardFrames({
  beats,
  index,
  name,
  onFail,
}: {
  beats: readonly FormBeat[];
  index: number;
  name: string;
  onFail: () => void;
}) {
  /* The FIRST frame sits in normal flow and sizes the box; the rest
     overlay it. The container used to declare `aspectRatio: 680/594`,
     measured off the first card — and a later card of the same exercise
     came back 680x734, which letterboxed inside a box shaped for the
     old one. Since every frame of a sequence shares one canvas (pinned
     in bodyRig.test.ts), the frame itself is the honest sizer and there
     is no constant to keep in step. */
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      {beats.map((b, i) => (
        <img
          key={b.image}
          src={frameUrl(b.image!)}
          alt={i === index ? `${name}, ${b.label}` : ""}
          aria-hidden={i !== index}
          draggable={false}
          onError={onFail}
          className={
            i === 0
              ? "block w-full motion-safe:transition-opacity"
              : "absolute inset-0 size-full object-contain motion-safe:transition-opacity"
          }
          style={{
            opacity: i === index ? 1 : 0,
            transitionDuration: `${PLACARD_TIMING.moveMs}ms`,
          }}
        />
      ))}
    </div>
  );
});

/**
 * The capture channel's anchor, on the reduced-motion renders ONLY.
 *
 * `form-demo.screens.capture.spec.ts` used to wait on the two-up's
 * accessible name, and its comment explains why it had to be the EXACT
 * string: `/demonstration/i` alone also matches the animated player, so
 * a looser locator shipped frames of a running loop. Then the placard
 * arrived, whose still version is a six-panel storyboard with no such
 * element, and the capture broke at `dips` — taking every demo after it
 * in the same run.
 *
 * A presentation-independent attribute is the fix, and it keeps the
 * guarantee the string was carrying: it exists on the two reduced-motion
 * roots and nowhere else, so the animated loop can never be captured by
 * accident. Pinned against the real render in
 * `ExerciseRigDemo.test.tsx`, per CLAUDE.md's rule about capture
 * selectors.
 */

/** Phase cues for the looping rep. Labels are generic and direction-
 *  derived — the eccentric is always "lower under control" and the
 *  concentric always the drive, whichever end of t the exercise locks
 *  out at. Per-exercise authored cues are future content work. */
const PHASE_LABEL: Record<RepPhase, string> = {
  set: "Set",
  eccentric: "Lower under control",
  pause: "Pause",
  drive: "Drive up",
  lockout: "Lockout",
  done: "Rep complete",
  cycle: "Steady rhythm",
};

/**
 * Exercise demo built from the REAL muscle-map figure (bodyRig): the exact
 * react-body-highlighter polygons the Form view already renders, moved by
 * skeletal transforms. Working-muscle highlights BREATHE with the effort
 * phase — brightest through the lifting drive, softer on the way down.
 *
 * The rep LOOPS continuously while the surface is active — the
 * gym-placard demo model (owner feedback 2026-07-27: "the reps don't
 * repeat properly"; the reference is the looping demo screens on gym
 * equipment). This supersedes the Demo1 single-rep-then-settle player
 * and its replay control. A short "Set" lead-in still holds the lockout
 * frame so the eye finds the figure before anything moves, then the
 * phase-cued cycle (lower → pause → drive → lockout) repeats until the
 * sheet closes or `active` goes false. Reduced-motion users get the
 * static two-up of the extremes, unchanged.
 *
 * Rendering is IMPERATIVE inside the rAF loop: frames write the figure
 * div's innerHTML directly instead of going through setState, so the
 * 30fps sweep costs zero React reconciliations — the difference is
 * visible on older phones inside WKWebView. React only re-renders on
 * PHASE changes (four per cycle) for the cue line.
 *
 * The 30fps throttle advances its clock in WHOLE intervals: re-anchoring
 * to `now` on every draw made draw spacing alternate ~33/50ms against a
 * 60Hz rAF — a visible judder the device feedback called reps that
 * "spaz out". Quantized stepping keeps the spacing even.
 */
export default function ExerciseRigDemo({
  exerciseId,
  name,
  active = true,
  tempo,
  onStep,
}: {
  exerciseId: string;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is stopped (hidden sheets shouldn't burn rAF). */
  active?: boolean;
  /** Authored "down-pause-up" tempo (seconds) — drives the cycle's phase
   *  durations via lib/exerciseTempo; absent → the calm defaults. */
  tempo?: string;
  /** Which placard position is on screen, so the numbered list beneath
   *  the player can light the matching row. Only ever called for a
   *  placard demo. */
  onStep?: (index: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  /* Held in a ref so a caller passing an inline arrow does not restart
     the animation on every one of its own renders — which, since the
     caller re-renders on each step, would be every step. Written in an
     effect rather than during render: a ref write during render is not
     a rendering output and React may discard the render it happened
     in. */
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);
  // Which end of t is the concentric top decides the cycle's shape AND
  // the opening frame: squats/hinges lock out at t=0 (standing),
  // presses/curls at t=1. The loop starts from lockout.
  const demo = getBodyDemo(exerciseId);
  const liftsToOne = demo?.concentricTo === 1;
  const lockoutT = liftsToOne ? 1 : 0;
  /* Where the rep BEGINS, which is not the same question as which end
     locks out. A squat and a deadlift both finish standing; the squat
     starts there and the deadlift starts with the bar on the floor.
     The player opened every demo at lockout, so a deadlift began with
     the lift already done. */
  const startsAt: RepStart = demo?.startsAt ?? "lockout";
  const stretchT = liftsToOne ? 0 : 1;
  /* A CYCLE (a gait, a pedal stroke, a jump-and-step-down) has no
     lockout or stretch: t=1 is t=0 again, and it must never play
     backwards. It opens at t=0 and advances monotonically. */
  const cycle = demo?.cycle === true;
  const cycleMs = demo?.cycleMs ?? CYCLE_MS_DEFAULT;
  /* A PLACARD steps through NAMED positions — the numbered panels of a
     form card — holding on each long enough to read its cue and
     tweening between them. It opens on its own first position, which
     is the one the caption names, so `startsAt` and the rep timeline
     do not apply. */
  const beats = getFormBeats(exerciseId);
  const placard = beats !== null && beats.length > 0;
  /* SUPPLIED frames: where every position carries one, the pictures are
     the animation and the rig figure is the fallback. Partial coverage
     is not a half-state worth building — a sequence that alternated
     between a photograph and a drawing would read as broken — so it is
     all or nothing. */
  const [framesFailed, setFramesFailed] = useState(false);
  const framed =
    placard && !framesFailed && beats !== null && beats.every((b) => b.image);
  const openingT =
    placard && beats
      ? beats[0].t
      : cycle
        ? 0
        : startsAt === "stretch"
          ? stretchT
          : lockoutT;

  // First paint = the lockout frame. Stable per instance (the parent keys
  // this component by exercise), so React never rewrites the figure div
  // after mount — the rAF loop owns its innerHTML from then on.
  const initialHtml = useMemo(
    // Skipped entirely while supplied frames are on screen: it is a
    // whole figure render, and the fallback does not need to be warm —
    // when a frame fails, `framed` flips and this recomputes.
    () => ({ __html: framed ? "" : renderBodyDemo(exerciseId, openingT, 0.7) }),
    [exerciseId, openingT, framed]
  );
  const figureRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<RepPhase>("set");
  /** Which placard position is on screen. Same discipline as `phase`:
   *  state changes only when it actually changes, so the figure div's
   *  memo boundary keeps the rAF loop out of React. */
  const [beatIndex, setBeatIndex] = useState(0);
  const beatRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const effortRef = useRef(0.7);
  const phaseRef = useRef<RepPhase>("set");

  useEffect(() => {
    if (reducedMotion || !active) return;
    // Deterministic restart: the draw-throttle clock and the effort
    // low-pass start every run from the same calm state — not from
    // wherever a previous mount left them.
    lastDrawRef.current = 0;
    effortRef.current = 0.7;
    beatRef.current = 0;
    const timing = repTimingFor(tempo);
    const start = performance.now();
    const draw = (svg: string) => {
      if (figureRef.current) figureRef.current.innerHTML = svg;
    };
    const cue = (p: RepPhase) => {
      if (phaseRef.current === p) return;
      phaseRef.current = p;
      setPhase(p);
    };
    cue("set");
    if (!framed) draw(renderBodyDemo(exerciseId, openingT, 0.7));

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // The 1ms tolerance matters: an exact `< FPS_INTERVAL` check
      // flips on float noise right at the boundary (a 33.3333…−ε delta
      // reads as "too soon"), which skips a frame and produces the very
      // 33/50ms alternation this throttle exists to prevent.
      if (now - lastDrawRef.current < FPS_INTERVAL - 1) return;
      // Advance the throttle clock in WHOLE intervals on a fixed
      // lattice (catching up after hitches without re-anchoring to the
      // noisy rAF timestamp) — even spacing, no 33/50ms alternation.
      lastDrawRef.current +=
        FPS_INTERVAL *
        Math.max(1, Math.round((now - lastDrawRef.current) / FPS_INTERVAL));

      let t: number;
      let targetEffort: number;
      if (placard && beats) {
        const sample = placardSampleAt(now - start, beats.length);
        const from = beats[sample.index].t;
        // The last position tweens back to the first, so a sequence
        // that ends where it began simply holds across the wrap.
        const to = beats[(sample.index + 1) % beats.length].t;
        t = sample.moving ? lerpT(from, to, smoothK(sample.k)) : from;
        /* Effort follows the direction of travel rather than a named
           phase: brightest heading for the finished position, softer
           on the way out of it, settled through a hold. */
        const towardFinish = liftsToOne ? to > from : to < from;
        targetEffort = sample.moving ? (towardFinish ? 1 : 0.45) : 0.7;
        if (beatRef.current !== sample.index) {
          beatRef.current = sample.index;
          setBeatIndex(sample.index);
          onStepRef.current?.(sample.index);
        }
      } else {
        const sample = cycle
          ? cycleSampleAt(now - start, cycleMs)
          : repSampleLoopedAt(now - start, timing, startsAt);
        t = cycle ? sample.ecc : liftsToOne ? 1 - sample.ecc : sample.ecc;
        targetEffort = sample.targetEffort;
        cue(sample.phase);
      }
      // Low-pass the effort so phase changes glow in, never flicker.
      effortRef.current += (targetEffort - effortRef.current) * 0.1;
      // With supplied frames there is no figure to redraw — the loop's
      // only job is to say which position is current, and the crossfade
      // is CSS. Kept on the same clock rather than a second timer so
      // there is one timing path to reason about and to test.
      if (!framed) draw(renderBodyDemo(exerciseId, t, effortRef.current));
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    exerciseId,
    reducedMotion,
    active,
    tempo,
    liftsToOne,
    openingT,
    startsAt,
    cycle,
    cycleMs,
    placard,
    beats,
    framed,
  ]);

  /* The demo renders on a fixed DARK stage in both themes (like any
   * media viewer): the figure's facet gaps read as the dark surface
   * showing through — the exact contrast the muscle-map art was
   * designed against. A light backing would wash the gaps out. */
  if (reducedMotion && placard && beats && framed) {
    /* The same two-up shape every other demo gets: the START position
       and the far end of the movement. It used to print all six under
       their captions, which made sense while the stage was the only
       place the steps appeared — now they are a numbered list below,
       and printing them twice is the duplication this layout removes.
       `deepest` is the position furthest from the start, which for a
       placard is the one whose `t` is furthest from the first beat's. */
    const deepest = beats.reduce((far, b) =>
      Math.abs(b.t - beats[0].t) > Math.abs(far.t - beats[0].t) ? b : far
    );
    return (
      <div
        className="bg-stage rounded-2xl p-4 mt-4 flex justify-center gap-3"
        data-demo-still="placard"
      >
        {[beats[0], deepest].map((b, i) => (
          <img
            key={`${b.label}-${i}`}
            src={frameUrl(b.image!)}
            alt={`${name}, ${b.label}`}
            draggable={false}
            onError={() => setFramesFailed(true)}
            className="w-1/2 max-w-[150px]"
          />
        ))}
      </div>
    );
  }

  if (reducedMotion) {
    return (
      <div
        role="img"
        aria-label={`${name} demonstration — start and end positions`}
        className="bg-stage rounded-2xl p-4 mt-4 flex justify-center gap-3"
        data-demo-still="two-up"
      >
        {/* START position first, then the far end — so a deadlift reads
            floor-then-standing rather than the reverse. A cycle's far
            end is its opposite phase (t=0.5): the other foot forward,
            the other pedal down. */}
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{
            __html: renderBodyDemo(exerciseId, openingT),
          }}
        />
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{
            __html: renderBodyDemo(
              exerciseId,
              cycle ? 0.5 : openingT === 0 ? 1 : 0
            ),
          }}
        />
      </div>
    );
  }

  if (placard && beats) {
    const beat = beats[Math.min(beatIndex, beats.length - 1)];
    return (
      <div className="bg-stage rounded-2xl p-4 mt-4">
        {framed ? (
          <PlacardFrames
            beats={beats}
            index={beatIndex}
            name={name}
            onFail={() => setFramesFailed(true)}
          />
        ) : (
          <div
            role="img"
            aria-label={`${name} demonstration — stepping through each position`}
          >
            <Figure html={initialHtml} figureRef={figureRef} />
          </div>
        )}
        {/* One label line, in the looping player's own register. It
            NAMES the position and says where in the sequence it falls;
            the instruction it belongs to is in the numbered list below,
            where it can be read at the reader's own pace and where the
            active row lights up in time with this.

            That split is what let the hold come down: a caption that
            has to be READ in place sets the tempo of the whole demo,
            and a label that only has to be recognised does not. */}
        <p
          aria-live="polite"
          className="mt-2 text-center text-micro uppercase tracking-wider text-stage-muted"
        >
          {beat.label}
          <span className="ml-2 font-mono tabular-nums opacity-70">
            {beatIndex + 1}/{beats.length}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-stage rounded-2xl p-4 mt-4">
      <div role="img" aria-label={`${name} demonstration — looping reps`}>
        <Figure html={initialHtml} figureRef={figureRef} />
      </div>
      {/* Phase cue — the teaching half of the loop. aria-live=polite reads
          the phase to screen-reader users without interrupting. */}
      <p
        aria-live="polite"
        className="mt-2 text-center text-micro uppercase tracking-wider text-stage-muted"
      >
        {PHASE_LABEL[phase]}
      </p>
    </div>
  );
}
