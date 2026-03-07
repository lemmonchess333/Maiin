import { useMemo } from "react";

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

const MUSCLE_REGIONS: { id: string; label: string; path: string }[] = [
  // Traps
  { id: "traps_l", label: "Traps", path: "M 82,88 Q 88,82 93,86 L 90,93 Q 86,90 82,92 Z" },
  { id: "traps_r", label: "Traps", path: "M 118,88 Q 112,82 107,86 L 110,93 Q 114,90 118,92 Z" },
  // Shoulders
  { id: "shoulders_l", label: "Shoulders", path: "M 68,90 Q 74,80 82,88 L 82,100 Q 76,102 68,100 Q 64,96 68,90 Z" },
  { id: "shoulders_r", label: "Shoulders", path: "M 132,90 Q 126,80 118,88 L 118,100 Q 124,102 132,100 Q 136,96 132,90 Z" },
  // Chest
  { id: "chest_l", label: "Chest", path: "M 84,94 Q 92,90 100,93 L 100,112 Q 92,116 84,112 Z" },
  { id: "chest_r", label: "Chest", path: "M 116,94 Q 108,90 100,93 L 100,112 Q 108,116 116,112 Z" },
  // Biceps
  { id: "biceps_l", label: "Biceps", path: "M 64,102 Q 68,98 74,102 L 72,132 Q 68,136 64,132 Z" },
  { id: "biceps_r", label: "Biceps", path: "M 136,102 Q 132,98 126,102 L 128,132 Q 132,136 136,132 Z" },
  // Triceps (back of arm, shown slightly offset)
  { id: "triceps_l", label: "Triceps", path: "M 62,104 Q 64,100 68,102 L 66,130 Q 63,133 61,130 Z" },
  { id: "triceps_r", label: "Triceps", path: "M 138,104 Q 136,100 132,102 L 134,130 Q 137,133 139,130 Z" },
  // Forearms
  { id: "forearms_l", label: "Forearms", path: "M 62,134 Q 66,131 70,134 L 68,160 Q 65,162 62,160 Z" },
  { id: "forearms_r", label: "Forearms", path: "M 138,134 Q 134,131 130,134 L 132,160 Q 135,162 138,160 Z" },
  // Abs
  { id: "abs", label: "Core", path: "M 90,114 Q 100,111 110,114 L 110,158 Q 100,162 90,158 Z" },
  // Obliques
  { id: "obliques_l", label: "Obliques", path: "M 84,114 Q 88,112 90,114 L 90,155 Q 86,158 83,152 Z" },
  { id: "obliques_r", label: "Obliques", path: "M 116,114 Q 112,112 110,114 L 110,155 Q 114,158 117,152 Z" },
  // Glutes
  { id: "glutes_l", label: "Glutes", path: "M 84,158 Q 92,155 100,158 L 98,172 Q 92,175 86,172 Z" },
  { id: "glutes_r", label: "Glutes", path: "M 116,158 Q 108,155 100,158 L 102,172 Q 108,175 114,172 Z" },
  // Quads
  { id: "quads_l", label: "Quads", path: "M 82,174 Q 90,170 98,174 L 96,218 Q 90,222 84,218 Z" },
  { id: "quads_r", label: "Quads", path: "M 118,174 Q 110,170 102,174 L 104,218 Q 110,222 116,218 Z" },
  // Hamstrings (inner thigh area visible from front)
  { id: "hamstrings_l", label: "Hamstrings", path: "M 96,180 Q 100,178 100,180 L 100,216 Q 97,218 95,216 Z" },
  { id: "hamstrings_r", label: "Hamstrings", path: "M 104,180 Q 100,178 100,180 L 100,216 Q 103,218 105,216 Z" },
  // Calves
  { id: "calves_l", label: "Calves", path: "M 84,224 Q 90,220 96,224 L 94,260 Q 90,264 86,260 Z" },
  { id: "calves_r", label: "Calves", path: "M 116,224 Q 110,220 104,224 L 106,260 Q 110,264 114,260 Z" },
];

/** Map friendly muscle names → SVG region IDs */
const MUSCLE_MAPPING: Record<string, string[]> = {
  "Chest": ["chest_l", "chest_r"],
  "Pectorals": ["chest_l", "chest_r"],
  "Shoulders": ["shoulders_l", "shoulders_r"],
  "Deltoids": ["shoulders_l", "shoulders_r"],
  "Biceps": ["biceps_l", "biceps_r"],
  "Triceps": ["triceps_l", "triceps_r"],
  "Arms": ["biceps_l", "biceps_r", "triceps_l", "triceps_r"],
  "Core": ["abs", "obliques_l", "obliques_r"],
  "Abs": ["abs", "obliques_l", "obliques_r"],
  "Quads & Glutes": ["quads_l", "quads_r", "glutes_l", "glutes_r"],
  "Hamstrings & Back": ["hamstrings_l", "hamstrings_r", "traps_l", "traps_r"],
  "Back": ["traps_l", "traps_r"],
  "Lats": ["traps_l", "traps_r", "obliques_l", "obliques_r"],
  "Quads": ["quads_l", "quads_r"],
  "Quadriceps": ["quads_l", "quads_r"],
  "Hamstrings": ["hamstrings_l", "hamstrings_r"],
  "Glutes": ["glutes_l", "glutes_r"],
  "Calves": ["calves_l", "calves_r"],
  "Legs": ["quads_l", "quads_r", "hamstrings_l", "hamstrings_r", "calves_l", "calves_r", "glutes_l", "glutes_r"],
  "Forearms": ["forearms_l", "forearms_r"],
};

// Dark-base purple colour scheme
const BASE_COLOR = "#2a2a3a";
const UNTRAINED_COLOR = "#3d3d52";
const LOW_COLOR = "#6d5a9e";     // 1–20 sets
const MID_COLOR = "#8b5cf6";     // 21–60 sets
const HIGH_COLOR = "#a78bfa";    // 60+ sets

function getMuscleColor(sets: number): string {
  if (sets <= 0) return UNTRAINED_COLOR;
  if (sets <= 20) return LOW_COLOR;
  if (sets <= 60) return MID_COLOR;
  return HIGH_COLOR;
}

function shouldGlow(sets: number): boolean {
  return sets > 60;
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

  const getSetsForMuscle = (muscleId: string): number => {
    let sets = 0;
    for (const [group, count] of Object.entries(normalizedData)) {
      const regions = MUSCLE_MAPPING[group] || [];
      if (regions.includes(muscleId)) sets += count;
    }
    return sets;
  };

  return (
    <div className="p-4 rounded-2xl border border-border/50" style={{ backgroundColor: "#0F0F14" }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "#E8E8ED" }}>Muscle Groups Trained</h3>
      <div className="flex flex-col items-center">
        <svg viewBox="55 70 90 200" className="w-36 h-56">
          <defs>
            <filter id="glow-filter">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Head */}
          <ellipse cx="100" cy="78" rx="10" ry="11" fill={BASE_COLOR} />
          {/* Neck */}
          <rect x="95" y="87" width="10" height="5" rx="3" fill={BASE_COLOR} />

          {/* Body outline for context */}
          <line x1="100" y1="89" x2="100" y2="92" stroke={BASE_COLOR} strokeWidth="8" />

          {/* Muscle regions */}
          {MUSCLE_REGIONS.map((region) => {
            const sets = getSetsForMuscle(region.id);
            const color = getMuscleColor(sets);
            const glow = shouldGlow(sets);
            return (
              <path
                key={region.id}
                d={region.path}
                fill={color}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="0.3"
                filter={glow ? "url(#glow-filter)" : undefined}
              />
            );
          })}

          {/* Knee joints (cosmetic) */}
          <circle cx="90" cy="221" r="2.5" fill={BASE_COLOR} />
          <circle cx="110" cy="221" r="2.5" fill={BASE_COLOR} />
          {/* Feet */}
          <ellipse cx="90" cy="265" rx="5" ry="2" fill={BASE_COLOR} />
          <ellipse cx="110" cy="265" rx="5" ry="2" fill={BASE_COLOR} />
        </svg>
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
          {Object.entries(normalizedData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([group, sets]) => (
              <div key={group} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: getMuscleColor(sets) }} />
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>{group}</span>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{sets} sets</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
