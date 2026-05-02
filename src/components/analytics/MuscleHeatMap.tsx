import { useMemo, useSyncExternalStore } from "react";
import Model, { type IExerciseData } from "react-body-highlighter";
import { THEME } from "@/lib/theme";

interface MuscleData {
  [group: string]: number;
}

interface MuscleHeatMapProps {
  data: MuscleData;
  accentColor?: string;
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
  "Chest": ["chest"],
  "Back": ["upper-back", "lower-back"],
  "Shoulders": ["front-deltoids", "back-deltoids"],
  "Biceps": ["biceps"],
  "Triceps": ["triceps"],
  "Legs": ["quadriceps", "gluteal", "hamstring", "calves"],
  "Core": ["abs", "obliques"],
  "Full Body": ["chest", "upper-back", "quadriceps", "abs"],
  "Cardio": [],
  // Legacy aliases via CATEGORY_DISPLAY
  "Quads & Glutes": ["quadriceps", "gluteal"],
  "Hamstrings & Back": ["hamstring", "upper-back", "lower-back"],
  "Lats": ["upper-back"],
  "Calves": ["calves"],
  "Traps": ["trapezius"],
};

const LOW_COLOR = THEME.liftingLight;
const MID_COLOR = THEME.lifting;
const HIGH_COLOR = "#6560C8"; // darker lifting shade

function getLegendDotColor(sets: number): string {
  if (sets <= 30) return LOW_COLOR;
  if (sets <= 70) return MID_COLOR;
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

export default function MuscleHeatMap({ data }: MuscleHeatMapProps) {
  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getIsDark,
    () => false,
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

  // Build exercise data for react-body-highlighter
  const exerciseData: IExerciseData[] = useMemo(() => {
    return Object.entries(normalizedData)
      .filter(([, sets]) => sets > 0)
      .map(([group, sets]) => ({
        name: group,
        muscles: MUSCLE_MAP[group] ?? [],
        frequency: sets > 60 ? 3 : sets > 25 ? 2 : 1,
      }));
  }, [normalizedData]);

  // Only show trained muscle groups, sorted descending
  const trainedGroups = useMemo(() => {
    return Object.entries(normalizedData)
      .filter(([, sets]) => sets > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [normalizedData]);

  return (
    <div className="p-4 rounded-2xl border border-border/50 bg-card">
      <h3 className="text-sm font-semibold mb-3 text-foreground">
        Muscle Groups Trained
      </h3>
      <div className="flex flex-col items-center">
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "16px 0" }}>
          {/* Front view */}
          <Model
            data={exerciseData}
            style={{ width: 140 }}
            highlightedColors={[LOW_COLOR, MID_COLOR, HIGH_COLOR]}
            bodyColor={bodyColor}
            type="anterior"
          />
          {/* Back view */}
          <Model
            data={exerciseData}
            style={{ width: 140 }}
            highlightedColors={[LOW_COLOR, MID_COLOR, HIGH_COLOR]}
            bodyColor={bodyColor}
            type="posterior"
          />
        </div>

        {/* Legend: only trained groups, sorted by sets descending */}
        {trainedGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {trainedGroups.map(([group, sets]) => (
              <div key={group} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: getLegendDotColor(sets) }}
                />
                <span className="text-xs text-muted-foreground font-medium">
                  {group}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {sets} sets
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
