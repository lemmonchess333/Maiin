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
import { getBodyDemo, getDemoMuscleKey, getFormBeats } from "@/lib/bodyRig";
import MuscleKey from "@/components/MuscleKey";
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
  /* Which placard position the player is showing, so the numbered list
     can light the matching row. This is the "words appear in time"
     idea without the cost that comes with it: the whole list stays
     readable at the reader's own pace, and the highlight only says
     which row the figure is on. */
  const [activeStep, setActiveStep] = useState(0);

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
  const rigDemo = exerciseId ? getBodyDemo(exerciseId) : null;
  const hasAnimation = !rigDemo && demo.images.length > 0 && !demoFailed;
  /* A placard demo teaches the steps ON the figure — each position
     named and cued under the drawing it belongs to. Showing the same
     sequence again as a numbered list directly beneath it is the
     duplication the style exists to remove, so the authored steps
     collapse behind their own disclosure instead of leading with two
     of them. They are NOT dropped: the catalogue text carries detail
     the seven-word cues cannot (the 30 degrees of lean, why it is
     there), and it stays one tap away. */
  /* A placard's own positions ARE the instructions: six named beats
     that match the label under the figure word for word, so a reader
     can follow the animation down the list. They replace the
     catalogue's prose steps rather than sitting beside them — two
     numbered lists describing one movement is the duplication the
     layout exists to remove. The catalogue's tip and common mistakes
     still render below, unchanged. */
  const beats = exerciseId ? getFormBeats(exerciseId) : null;
  const steps = beats ? beats.map((b) => b.cue) : demo.instructions;
  const collapsedSteps = beats ? steps.length : COLLAPSED_STEPS;

  return (
    <div>
      {/* Metadata tags */}
      <div className="flex items-center gap-2">
        {demo.category && (
          <span className="inline-flex items-center justify-center whitespace-nowrap h-7 px-3 rounded-full text-small font-semibold text-white bg-lifting-fill">
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
      {rigDemo && exerciseId && (
        <ExerciseRigDemo
          key={exerciseId}
          exerciseId={exerciseId}
          name={demo.name}
          active={active}
          tempo={demo.tempo}
          onStep={beats ? setActiveStep : undefined}
        />
      )}

      {hasAnimation && (
        <ExerciseDemoPlayer
          key={demo.name}
          frames={demo.images}
          name={demo.name}
          active={active}
          mediaKind={
            // Demo1: provenance gates animation — borrowed free-exercise-db
            // pairs render static; only reviewed coach frames auto-play.
            demo.mediaKind === "reference-photos"
              ? "reference-photos"
              : "vetted-sequence"
          }
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
                <p
                  className="text-xs mt-2"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
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
                <p
                  className="text-xs mt-2"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Back
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* The muscles worked, as a KEY: a swatch in the tier's own
          paint, so the reader can tie a purple shape on the figure to a
          name. It was two rows of chips prefixed "Primary:" /
          "Secondary:" until 2026-09-03 — the chips carried nothing the
          text did not, and named muscles without saying which colour
          was which.

          Supplied card art brings its OWN names: the catalogue's groups
          describe the exercise, and a key has to describe the picture.

          Dedup secondary against primary — LOCAL_MUSCLE_MAP
          intentionally expands "Upper Chest" → ["chest", "shoulders"]
          so the body diagram highlights front delts for Incline Bench
          Press, but the same expansion produces a duplicate "shoulders"
          entry when secondaryMuscles already lists Front Delts →
          shoulders. Primary wins ties, being the more emphatic
          categorisation. */}
      {(() => {
        const supplied = exerciseId ? getDemoMuscleKey(exerciseId) : null;
        if (supplied) return <MuscleKey {...supplied} />;
        const primarySet = new Set(demo.primaryMuscles);
        return (
          <MuscleKey
            primary={demo.primaryMuscles}
            secondary={demo.secondaryMuscles.filter((m) => !primarySet.has(m))}
          />
        );
      })()}

      {/* Instructions — Phase-3 reading surface (visual audit W2–W4):
          steps collapse to WHOLE steps (the old 60px max-height cut the
          second step mid-line behind a gradient), markers are contained
          numbered chips instead of bare "1." text, and the Watch-out cue
          sits OUTSIDE the collapse so the guide's highest-value line is
          always visible. Warning register is THEME.warning — the previous
          nutrition-orange was food-domain colour on a lifting surface. */}
      {steps.length > 0 && (
        <div className="mt-6">
          <p className="text-lg font-bold text-foreground">Instructions</p>
          <div className="flex flex-col gap-4 mt-3">
            {(showInstructions ? steps : steps.slice(0, collapsedSteps)).map(
              (step, i) => {
                const live = beats !== null && i === activeStep;
                return (
                  <div key={i} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className={
                        live
                          ? "mt-0.5 size-5 shrink-0 rounded-full bg-lifting text-white text-xs font-bold font-mono tabular-nums flex items-center justify-center motion-safe:transition-colors"
                          : "mt-0.5 size-5 shrink-0 rounded-full bg-lifting/10 text-lifting-strong text-xs font-bold font-mono tabular-nums flex items-center justify-center motion-safe:transition-colors"
                      }
                    >
                      {i + 1}
                    </span>
                    <p
                      className={
                        live
                          ? "text-body text-foreground leading-relaxed motion-safe:transition-colors"
                          : "text-body text-foreground/80 leading-relaxed motion-safe:transition-colors"
                      }
                    >
                      {step}
                    </p>
                  </div>
                );
              }
            )}
          </div>
          {steps.length > collapsedSteps && (
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1 mt-3 min-h-[44px] text-body font-medium text-lifting-strong"
            >
              {showInstructions ? (
                <>
                  <ChevronUp className="size-4" /> Hide
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" /> All {steps.length} steps
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
                {/* Heading on the -strong text step, not the identity —
                    the identity is fill/icon grade (~3.1:1 on the light
                    tint at 14px). Icon + tint above keep THEME.warning. */}
                <p
                  className="text-small font-semibold"
                  style={{ color: "hsl(var(--warning-strong))" }}
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
