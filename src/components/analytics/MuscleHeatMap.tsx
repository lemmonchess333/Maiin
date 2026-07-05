import { useMemo, useSyncExternalStore } from "react";
import Model, { type IExerciseData } from "react-body-highlighter";
import { THEME } from "@/lib/theme";
import BodyMapGlow from "@/components/BodyMapGlow";
import { getShareTier, getFrequencyForShare } from "./muscleShare";
import type { GroupRecovery } from "@/lib/muscleRecovery";

interface MuscleData {
  [group: string]: number;
}

interface MuscleHeatMapProps {
  data: MuscleData;
  accentColor?: string;
  /**
   * Per-group recovery state (Tier-2 #6 second half) — chips on the legend
   * rows. NOW-state, deliberately independent of the page's TimeRange
   * (labelled "as of today" below the legend — the Hist5c strict-range rule
   * allows explicitly-labelled carve-outs). Omitted → card renders exactly
   * as before.
   */
  recovery?: Record<string, GroupRecovery>;
}

/** Translate technical movementCategory keys to user-friendly names */
const CATEGORY_DISPLAY: Record<string, string> = {
  knee_dominant: "Quads & Glutes",
  hip_dominant: "Hamstrings & Back",
  horizontal_push: "Chest",
  vertical_push: "Shoulders",
  horizontal_pull: "Back",
  vertical_pull: "Lats",
  arms_biceps: "Biceps",
  arms_triceps: "Triceps",
  core: "Core",
};

/** Map friendly muscle group names → react-body-highlighter muscle IDs.
 *  Keyed on the EXERCISE_CATEGORIES taxonomy from src/lib/exercises.ts
 *  ("Chest" / "Back" / "Shoulders" / "Biceps" / "Triceps" / "Legs" /
 *  "Core" / "Full Body" / "Cardio") — those are the strings actually
 *  written to saved workout docs.
 *
 *  Older alias keys ("Quads & Glutes", "Hamstrings & Back", "Lats",
 *  "Calves", "Traps") are kept for backward compatibility with the
 *  legacy CATEGORY_DISPLAY translation above, in case any historical
 *  workout doc was saved against the previous movement-key taxonomy. */
const MUSCLE_MAP: Record<string, IExerciseData["muscles"]> = {
  // Current taxonomy (EXERCISE_CATEGORIES)
  Chest: ["chest"],
  Back: ["upper-back", "lower-back"],
  Shoulders: ["front-deltoids", "back-deltoids"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Legs: ["quadriceps", "gluteal", "hamstring", "calves"],
  Core: ["abs", "obliques"],
  "Full Body": ["chest", "upper-back", "quadriceps", "abs"],
  Cardio: [],
  // Legacy aliases via CATEGORY_DISPLAY
  "Quads & Glutes": ["quadriceps", "gluteal"],
  "Hamstrings & Back": ["hamstring", "upper-back", "lower-back"],
  Lats: ["upper-back"],
  Calves: ["calves"],
  Traps: ["trapezius"],
};

const LOW_COLOR = THEME.liftingLight;
const MID_COLOR = THEME.lifting;
const HIGH_COLOR = THEME.brandStrong; // #6560C8 — darker lifting shade

/* Hist5c pin 8 — relative-volume share thresholds in ./muscleShare.
   Replaces the previous absolute set-count buckets which saturated
   the body diagram uniformly purple at long windows. */

function getLegendDotColor(sets: number, totalSets: number): string {
  const tier = getShareTier(sets, totalSets);
  if (tier === "low") return LOW_COLOR;
  if (tier === "mid") return MID_COLOR;
  return HIGH_COLOR;
}

// Subscribe to documentElement class changes so the body diagram recolours
// when the user toggles dark mode at runtime (Settings writes .dark on
// document.documentElement, see Settings.tsx:205).
function subscribeDarkMode(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

/** Legend recovery chip colours: still-loaded muscles stay in the lifting
 *  register (the map's own palette); READY gets the success token. */
function recoveryDotColor(status: GroupRecovery["status"]): string {
  if (status === "ready") return THEME.success;
  if (status === "nearly") return LOW_COLOR;
  return MID_COLOR;
}

export default function MuscleHeatMap({ data, recovery }: MuscleHeatMapProps) {
  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getIsDark,
    () => false
  );
  // Light: near-white silhouette (#e8e8f0) → calm iOS grouped-bg vibe.
  // Dark: mid-neutral (#2A2A30) so the silhouette sits cleanly on
  // bg-card (hsl 240 4% 10%) without bleaching out like the #e8e8f0
  // did under .dark.
  const bodyColor = isDark ? "#2A2A30" : "#e8e8f0";
  // Normalize technical keys → friendly names and merge counts
  const normalizedData = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(data)) {
      const friendly = CATEGORY_DISPLAY[key] || key;
      result[friendly] = (result[friendly] || 0) + val;
    }
    return result;
  }, [data]);

  /* Hist5c pin 8 — compute total sets ACROSS muscle groups so the
     frequency tier is a relative share of THIS window's training.
     A chest at 22% of total volume reads "high" whether the window
     is 1W with 50 total sets or 1Y with 2,500 total sets. */
  const totalSets = useMemo(
    () => Object.values(normalizedData).reduce((sum, n) => sum + n, 0),
    [normalizedData]
  );

  // Build exercise data for react-body-highlighter
  const exerciseData: IExerciseData[] = useMemo(() => {
    return Object.entries(normalizedData)
      .filter(([, sets]) => sets > 0)
      .map(([group, sets]) => ({
        name: group,
        muscles: MUSCLE_MAP[group] ?? [],
        frequency: getFrequencyForShare(sets, totalSets),
      }));
  }, [normalizedData, totalSets]);

  // Only show trained muscle groups, sorted descending
  const trainedGroups = useMemo(() => {
    return Object.entries(normalizedData)
      .filter(([, sets]) => sets > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [normalizedData]);

  /* Phase-2 glow (visual audit W1/W2): the flat tier fills read static —
     especially on OLED dark where they sit dead on the card. Volume becomes
     light: high-share muscles emit a brighter halo that settles first,
     mid-share a fainter one moments later (intensity stagger), and the
     single most-trained group carries one slow ambient pulse. Implemented
     as blurred overlay Models behind the base diagram (see BodyMapGlow) —
     static filter, animated opacity only. */
  const glowHigh = useMemo(
    () => exerciseData.filter((e) => e.frequency === 3),
    [exerciseData]
  );
  const glowMid = useMemo(
    () => exerciseData.filter((e) => e.frequency === 2),
    [exerciseData]
  );
  const topGroup = trainedGroups[0]?.[0];
  const glowTop = useMemo(
    () => exerciseData.filter((e) => e.name === topGroup),
    [exerciseData, topGroup]
  );

  const renderView = (type: "anterior" | "posterior") => (
    <div className="relative">
      <BodyMapGlow
        data={glowHigh}
        type={type}
        color={MID_COLOR}
        opacity={0.55}
        delay={0.1}
        width={140}
      />
      <BodyMapGlow
        data={glowMid}
        type={type}
        color={LOW_COLOR}
        opacity={0.28}
        delay={0.4}
        width={140}
      />
      <BodyMapGlow
        data={glowTop}
        type={type}
        color={THEME.liftingLight}
        opacity={0.45}
        pulse
        width={140}
      />
      <Model
        data={exerciseData}
        style={{ width: 140 }}
        highlightedColors={[LOW_COLOR, MID_COLOR, HIGH_COLOR]}
        bodyColor={bodyColor}
        type={type}
      />
    </div>
  );

  return (
    <div className="p-4 rounded-2xl border border-border/50 bg-card">
      <h3 className="text-sm font-semibold mb-3 text-foreground">
        Muscle Groups Trained
      </h3>
      <div className="flex flex-col items-center">
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            padding: "16px 0",
          }}
        >
          {renderView("anterior")}
          {renderView("posterior")}
        </div>

        {/* Legend: only trained groups, sorted by sets descending. When the
            recovery prop is present each row gains a readiness chip — a
            NOW-state annotation (see the footnote), not range data. */}
        {trainedGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {trainedGroups.map(([group, sets]) => {
              const rec = recovery?.[group];
              return (
                <div key={group} className="flex items-center gap-1.5">
                  <div
                    className="size-2 rounded-full"
                    style={{ background: getLegendDotColor(sets, totalSets) }}
                  />
                  <span className="text-xs text-muted-foreground font-medium">
                    {group}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {sets} sets
                  </span>
                  {rec && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 text-[10px] text-muted-foreground"
                      title={
                        rec.status === "ready"
                          ? `${group} is recovered`
                          : `${group} ready in ~${rec.readyInDays}d`
                      }
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: recoveryDotColor(rec.status) }}
                        aria-hidden
                      />
                      {rec.status === "ready" ? (
                        "ready"
                      ) : (
                        <>
                          ~
                          <span className="font-mono tabular-nums">
                            {rec.readyInDays}
                          </span>
                          d
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {recovery && trainedGroups.length > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground/70 text-center">
            Recovery chips are as of today, independent of the selected range.
          </p>
        )}
      </div>
    </div>
  );
}
