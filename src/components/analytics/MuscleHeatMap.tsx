import { useMemo } from "react";
import Model, { type IExerciseData } from "react-body-highlighter";

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

/** Map friendly muscle group names → react-body-highlighter muscle IDs */
const MUSCLE_MAP: Record<string, IExerciseData["muscles"]> = {
  "Quads & Glutes": ["quadriceps", "gluteal"],
  "Hamstrings & Back": ["hamstring", "upper-back", "lower-back"],
  "Core": ["abs", "obliques"],
  "Shoulders": ["front-deltoids", "back-deltoids"],
  "Chest": ["chest"],
  "Biceps": ["biceps"],
  "Triceps": ["triceps"],
  "Back": ["upper-back", "lower-back"],
  "Lats": ["upper-back"],
  "Calves": ["calves"],
  "Traps": ["trapezius"],
};

const LOW_COLOR = "#c4b5fd";
const MID_COLOR = "#7C6EF6";
const HIGH_COLOR = "#6358D4";

function getLegendDotColor(sets: number): string {
  if (sets <= 30) return LOW_COLOR;
  if (sets <= 70) return MID_COLOR;
  return HIGH_COLOR;
}

export default function MuscleHeatMap({ data }: MuscleHeatMapProps) {
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
    <div
      className="p-4 rounded-2xl border border-border/50"
      style={{ backgroundColor: "#ffffff" }}
    >
      <h3 className="text-sm font-semibold mb-3 text-foreground">
        Muscle Groups Trained
      </h3>
      <div className="flex flex-col items-center">
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "16px 0" }}>
          {/* Front view */}
          <Model
            data={exerciseData}
            style={{ width: 140 }}
            highlightedColors={["#c4b5fd", "#7C6EF6", "#6358D4"]}
            bodyColor="#e8e8f0"
            type="anterior"
          />
          {/* Back view */}
          <Model
            data={exerciseData}
            style={{ width: 140 }}
            highlightedColors={["#c4b5fd", "#7C6EF6", "#6358D4"]}
            bodyColor="#e8e8f0"
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
                <span className="text-[11px] text-muted-foreground font-medium">
                  {group}
                </span>
                <span className="text-[11px]" style={{ color: "#9ca3af" }}>
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
