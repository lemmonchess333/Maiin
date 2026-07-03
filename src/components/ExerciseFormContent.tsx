import { useState, useEffect, memo } from "react";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import {
  getExerciseDemo,
  mapMuscles,
  needsPosterior,
  needsAnterior,
  type ExerciseDemo,
} from "@/lib/exerciseDemo";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { THEME } from "@/lib/theme";
import { Spinner } from "@/components/ui/Spinner";
import ExerciseDemoPlayer from "@/components/ExerciseDemoPlayer";
import ExerciseRigDemo from "@/components/ExerciseRigDemo";
import { getRigDemo } from "@/lib/demoRig";
import { EXERCISES } from "@/lib/exercises";
import BodyMapGlow from "@/components/BodyMapGlow";

// Exercise "form" / demo content — muscle diagrams, primary/secondary
// muscle pills, step-by-step instructions. Rendered inline by
// ExerciseHistory as a "Form" tab so users reviewing an exercise's
// progression can check form cues without a second navigation.
//
// Kept as a pure content component — no drawer, no close button, no
// safe-area handling. The caller owns all that.

interface Props {
  exerciseName: string;
  // When false, defer the async demo fetch. Drawer consumers set this
  // based on open state to avoid fetching before the drawer is shown.
  active?: boolean;
}

// Collapsed instruction preview shows this many WHOLE steps (never a
// mid-line clip — the old 60px max-height cut step two in half).
const COLLAPSED_STEPS = 2;

function ExerciseFormContent({ exerciseName, active = true }: Props) {
  const [demo, setDemo] = useState<ExerciseDemo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  // True once the demo player reports every frame failed to load — flips the
  // hero back to the muscle diagram so a no-image exercise never shows a dead
  // empty box. Reset per exercise in the load effect below.
  const [demoFailed, setDemoFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const load = async () => {
      setLoading(true);
      setShowInstructions(false);
      setDemoFailed(false);
      const d = await getExerciseDemo(exerciseName);
      setDemo(d);
      setLoading(false);
    };
    load();
  }, [exerciseName, active]);

  const primaryMapped = demo
    ? (mapMuscles(demo.primaryMuscles) as Muscle[])
    : [];
  const secondaryMapped = demo
    ? (mapMuscles(demo.secondaryMuscles) as Muscle[])
    : [];
  const allMuscles = [...primaryMapped, ...secondaryMapped];
  const showFront = needsAnterior(allMuscles);
  const showBack = needsPosterior(allMuscles);
  const showBoth = showFront && showBack;

  const highlightData: IExerciseData[] = [
    ...(primaryMapped.length > 0
      ? [
          { name: "Primary1" as const, muscles: primaryMapped },
          { name: "Primary2" as const, muscles: primaryMapped },
        ]
      : []),
    ...(secondaryMapped.length > 0
      ? [{ name: "Secondary" as const, muscles: secondaryMapped }]
      : []),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" variant="primary" label="Loading exercise demo" />
      </div>
    );
  }

  if (!demo) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="flex justify-center gap-4">
          <div className="opacity-30">
            <Model
              data={[]}
              style={{ width: "120px", padding: "0" }}
              type="anterior"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          No demo available for this exercise
        </p>
        <p className="text-lg font-semibold text-foreground">{exerciseName}</p>
      </div>
    );
  }

  // One body, not two: when the exercise has a usable demo it IS the hero
  // visual and the muscle worked drops to the Primary/Secondary pills below;
  // when there's no demo (or every frame failed) the muscle diagram is the
  // hero instead. Avoids stacking two redundant body silhouettes. The fused
  // end-state (muscles highlighted ON the moving body) is the 3D-model path.
  // Rig demo (code-built faceted figure) outranks photos: it's the app's
  // own visual language, deterministic, and carries honest muscle tint.
  const exerciseId = EXERCISES.find(
    (e) => e.name.toLowerCase() === exerciseName.toLowerCase()
  )?.id;
  const rigDemo = exerciseId ? getRigDemo(exerciseId) : null;
  const hasAnimation = !rigDemo && demo.images.length > 0 && !demoFailed;

  return (
    <div>
      {/* Metadata tags */}
      <div className="flex items-center gap-2">
        {demo.category && (
          <span className="inline-flex items-center justify-center whitespace-nowrap h-7 px-3 rounded-full text-small font-semibold text-white bg-lifting">
            {demo.category}
          </span>
        )}
        {demo.equipment && (
          <span className="inline-flex items-center justify-center whitespace-nowrap h-7 px-3 rounded-full text-small font-medium border-[1.5px] border-border text-foreground/80">
            {demo.equipment}
          </span>
        )}
      </div>

      {/* Hero visual. When the exercise has a demo, the auto-playing
          crossfade loop IS the single body (no Start/Finish toggle, it just
          plays); muscles worked are conveyed by the pills below. The `key`
          gives each exercise a fresh player. onUnavailable flips back to the
          muscle diagram if every frame fails to load. */}
      {rigDemo && (
        <ExerciseRigDemo
          key={demo.name}
          demo={rigDemo}
          name={demo.name}
          active={active}
        />
      )}

      {hasAnimation && (
        <ExerciseDemoPlayer
          key={demo.name}
          frames={demo.images}
          name={demo.name}
          active={active}
          onUnavailable={() => setDemoFailed(true)}
        />
      )}

      {/* Muscle diagram — the hero only when there's no demo to show, so we
          never stack two body silhouettes. */}
      {!rigDemo && !hasAnimation && (
        <div className="bg-muted rounded-2xl p-5 mt-4">
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: showBoth ? 16 : 0,
            }}
          >
            {(showFront || (!showFront && !showBack)) && (
              <div
                style={{
                  textAlign: "center",
                  maxWidth: showBoth ? "45%" : "60%",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: showBoth ? 180 : 220,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Phase-2 glow: the target muscles emit a soft halo so the
                      diagram reads alive in the exercise context (same
                      WKWebView-safe overlay as the analytics heat map). */}
                  {primaryMapped.length > 0 && (
                    <BodyMapGlow
                      data={[{ name: "Glow", muscles: primaryMapped }]}
                      type="anterior"
                      color={THEME.lifting}
                      opacity={0.4}
                      blur={7}
                      width={showBoth ? "100%" : "160px"}
                      height={showBoth ? "180px" : "220px"}
                      svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                    />
                  )}
                  <Model
                    data={highlightData}
                    style={{
                      width: showBoth ? "100%" : "160px",
                      height: showBoth ? "180px" : "220px",
                      padding: "0",
                      margin: "0 auto",
                    }}
                    svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                    type="anterior"
                    highlightedColors={[THEME.liftingLight, THEME.lifting]}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: THEME.text.muted }}>
                  Front
                </p>
              </div>
            )}
            {showBack && (
              <div
                style={{
                  textAlign: "center",
                  maxWidth: showBoth ? "45%" : "60%",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: showBoth ? 180 : 220,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {primaryMapped.length > 0 && (
                    <BodyMapGlow
                      data={[{ name: "Glow", muscles: primaryMapped }]}
                      type="posterior"
                      color={THEME.lifting}
                      opacity={0.4}
                      blur={7}
                      width={showBoth ? "100%" : "160px"}
                      height={showBoth ? "180px" : "220px"}
                      svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                    />
                  )}
                  <Model
                    data={highlightData}
                    style={{
                      width: showBoth ? "100%" : "160px",
                      height: showBoth ? "180px" : "220px",
                      padding: "0",
                      margin: "0 auto",
                    }}
                    svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                    type="posterior"
                    highlightedColors={[THEME.liftingLight, THEME.lifting]}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: THEME.text.muted }}>
                  Back
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Primary / Secondary muscle pills.
          Dedup secondary against primary — LOCAL_MUSCLE_MAP intentionally
          expands "Upper Chest" → ["chest", "shoulders"] so the body
          diagram highlights front delts for Incline Bench Press, but
          the same expansion produces a duplicate "shoulders" chip
          when secondaryMuscles already lists Front Delts → shoulders.
          The diagram still gets both regions; the chip row reads as
          one canonical placement per muscle. Primary wins ties since
          it's the more emphatic categorisation. */}
      {(() => {
        const primarySet = new Set(demo.primaryMuscles);
        const secondaryDedup = demo.secondaryMuscles.filter(
          (m) => !primarySet.has(m)
        );
        return (
          <div className="mt-4">
            {demo.primaryMuscles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption font-medium text-muted-foreground/50 mr-1">
                  Primary:
                </span>
                {demo.primaryMuscles.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center whitespace-nowrap h-6 px-2.5 rounded-xl text-small font-medium bg-lifting/8 text-lifting"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
            {secondaryDedup.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-caption font-medium text-muted-foreground/50 mr-1">
                  Secondary:
                </span>
                {secondaryDedup.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center whitespace-nowrap h-6 px-2.5 rounded-xl text-small font-medium bg-muted text-foreground/70"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Instructions — Phase-3 reading surface (visual audit W2–W4):
          steps collapse to WHOLE steps (the old 60px max-height cut the
          second step mid-line behind a gradient), markers are contained
          numbered chips instead of bare "1." text, and the Watch-out cue
          sits OUTSIDE the collapse so the guide's highest-value line is
          always visible. Warning register is THEME.warning — the previous
          nutrition-orange was food-domain colour on a lifting surface. */}
      {demo.instructions.length > 0 && (
        <div className="mt-6">
          <p className="text-lg font-bold text-foreground">Instructions</p>
          <div className="flex flex-col gap-4 mt-3">
            {(showInstructions
              ? demo.instructions
              : demo.instructions.slice(0, COLLAPSED_STEPS)
            ).map((step, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 rounded-full bg-lifting/10 text-lifting text-xs font-bold font-mono tabular-nums flex items-center justify-center"
                >
                  {i + 1}
                </span>
                <p className="text-body text-foreground/80 leading-relaxed">
                  {step}
                </p>
              </div>
            ))}
          </div>
          {demo.instructions.length > COLLAPSED_STEPS && (
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1 mt-3 min-h-[44px] text-body font-medium text-lifting"
            >
              {showInstructions ? (
                <>
                  <ChevronUp className="size-4" /> Hide
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" /> All{" "}
                  {demo.instructions.length} steps
                </>
              )}
            </button>
          )}
          {demo.tip && (
            <div
              className="mt-4 flex gap-3 rounded-xl p-3"
              style={{ backgroundColor: `${THEME.warning}14` }}
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                style={{ color: THEME.warning }}
              />
              <div>
                <p
                  className="text-small font-semibold"
                  style={{ color: THEME.warning }}
                >
                  Watch out
                </p>
                <p className="mt-0.5 text-small leading-relaxed text-foreground/80">
                  {demo.tip}
                </p>
              </div>
            </div>
          )}
          {showInstructions &&
            demo.commonMistakes &&
            demo.commonMistakes.length > 0 && (
              <div className="mt-4">
                <p className="text-caption uppercase tracking-wide text-muted-foreground">
                  Common mistakes
                </p>
                <ul className="mt-1.5 space-y-1">
                  {demo.commonMistakes.map((m) => (
                    <li
                      key={m}
                      className="flex gap-2 text-small leading-relaxed text-foreground/80"
                    >
                      <span
                        className="mt-1.5 size-1 shrink-0 rounded-full"
                        style={{ background: THEME.warning }}
                        aria-hidden="true"
                      />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default memo(ExerciseFormContent);
