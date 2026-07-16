import { useEffect, useMemo, useRef, useState } from "react";
import { BODY_DEMOS, getBodyDemo, renderBodyDemo } from "@/lib/bodyRig";

/*
 * DEV/TEST-ONLY Form Motion Lab (Motion Rig V2 roadmap, Phase 1 —
 * docs/proposals/form-rig-master.md). Not in production builds; see the
 * route gating in App.tsx (same pattern as BrandBakeoff).
 *
 * Force-renders EVERY registered demo — including production-gated ones
 * (barbell-curl, rope-tricep-pushdown) — via the review renderer, so
 * topology/prop repairs can be inspected frame-by-frame before any
 * production enablement. This page is the review seam the roadmap's
 * approval gates run through; it never affects what ships.
 */

/** The five acceptance samples every visual review steps through,
 *  with the same effort shaping the preview script uses. */
const SAMPLES: ReadonlyArray<readonly [t: number, effort: number]> = [
  [0, 0.5],
  [0.25, 0.75],
  [0.5, 1],
  [0.75, 0.9],
  [1, 0.8],
];

function effortAt(t: number): number {
  // Piecewise-linear through the SAMPLES curve.
  for (let i = 1; i < SAMPLES.length; i++) {
    const [t0, e0] = SAMPLES[i - 1];
    const [t1, e1] = SAMPLES[i];
    if (t <= t1) return e0 + ((t - t0) / (t1 - t0)) * (e1 - e0);
  }
  return SAMPLES[SAMPLES.length - 1][1];
}

const REP_MS = 3000; // forward 0→1 then back, one bounded review rep
const FRAME_MS = 1000 / 30;

function DemoCard({ id }: { id: string }) {
  const productionEnabled = getBodyDemo(id) !== null;
  const [t, setT] = useState(0);
  const figureRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [playing, setPlaying] = useState(false);

  const initialSvg = useMemo(() => renderBodyDemo(id, 0, 0.5), [id]);

  const draw = (progress: number) => {
    if (figureRef.current) {
      figureRef.current.innerHTML = renderBodyDemo(
        id,
        progress,
        effortAt(progress)
      );
    }
  };

  useEffect(() => {
    draw(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, id]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const play = () => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(true);
    const start = performance.now();
    let lastDraw = 0;
    const tick = (now: number) => {
      const m = now - start;
      if (m >= REP_MS) {
        draw(0);
        setT(0);
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      // Triangle wave: out to the deepest point and back — both motion
      // directions get reviewed in one press.
      const half = REP_MS / 2;
      const progress = m < half ? m / half : 1 - (m - half) / half;
      draw(progress);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className="bg-card rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold truncate">{id}</h3>
        <span
          className={`text-micro font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            productionEnabled
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {productionEnabled ? "production" : "gated"}
        </span>
      </div>

      <div className="bg-stage rounded-lg p-3">
        <div
          ref={figureRef}
          className="mx-auto max-w-[160px]"
          dangerouslySetInnerHTML={{ __html: initialSvg }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={t}
        aria-label={`${id} progress`}
        onChange={(event) => {
          cancelAnimationFrame(rafRef.current);
          setPlaying(false);
          setT(Number(event.target.value));
        }}
        className="w-full"
      />

      <div className="flex items-center gap-1">
        {SAMPLES.map(([sample]) => (
          <button
            key={sample}
            type="button"
            onClick={() => {
              cancelAnimationFrame(rafRef.current);
              setPlaying(false);
              setT(sample);
            }}
            className={`flex-1 min-h-[44px] rounded-lg text-micro font-mono tabular-nums font-semibold border transition-colors ${
              Math.abs(t - sample) < 0.005
                ? "border-primary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {sample}
          </button>
        ))}
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="flex-1 min-h-[44px] rounded-lg text-micro font-semibold border border-border text-foreground disabled:opacity-50"
        >
          {playing ? "…" : "Play"}
        </button>
      </div>
    </div>
  );
}

export default function FormMotionLab() {
  const ids = useMemo(() => Object.keys(BODY_DEMOS).sort(), []);
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <h1 className="text-h2 font-extrabold">Form Motion Lab</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-prose">
        Dev-only review rig for every registered body demo — including
        production-gated ones (rendered via the review path). Step the five
        acceptance samples, scrub, or play one bounded out-and-back rep. Nothing
        here affects the shipped Form surface.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ids.map((id) => (
          <DemoCard key={id} id={id} />
        ))}
      </div>
    </div>
  );
}
