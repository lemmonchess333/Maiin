interface MuscleData {
  [group: string]: number;
}

interface MuscleHeatMapProps {
  data: MuscleData;
  accentColor?: string;
}

const MUSCLE_REGIONS: { id: string; label: string; path: string }[] = [
  { id: 'chest', label: 'Chest', path: 'M 85,95 Q 100,90 115,95 L 115,120 Q 100,125 85,120 Z' },
  { id: 'shoulders', label: 'Shoulders', path: 'M 70,85 Q 80,75 90,85 L 90,100 Q 80,95 70,100 Z' },
  { id: 'shoulders_r', label: 'Shoulders', path: 'M 110,85 Q 120,75 130,85 L 130,100 Q 120,95 110,100 Z' },
  { id: 'biceps', label: 'Biceps', path: 'M 65,100 Q 70,95 75,100 L 75,130 Q 70,135 65,130 Z' },
  { id: 'biceps_r', label: 'Biceps', path: 'M 125,100 Q 130,95 135,100 L 135,130 Q 130,135 125,130 Z' },
  { id: 'abs', label: 'Abs', path: 'M 88,120 Q 100,118 112,120 L 112,165 Q 100,168 88,165 Z' },
  { id: 'quads', label: 'Quads', path: 'M 82,170 Q 92,168 95,170 L 95,215 Q 92,218 82,215 Z' },
  { id: 'quads_r', label: 'Quads', path: 'M 105,170 Q 108,168 118,170 L 118,215 Q 108,218 105,215 Z' },
  { id: 'calves', label: 'Calves', path: 'M 84,220 Q 90,218 92,220 L 92,255 Q 90,258 84,255 Z' },
  { id: 'calves_r', label: 'Calves', path: 'M 108,220 Q 110,218 116,220 L 116,255 Q 110,258 108,255 Z' },
];

const MUSCLE_MAPPING: Record<string, string[]> = {
  'Chest': ['chest'], 'Pectorals': ['chest'],
  'Shoulders': ['shoulders', 'shoulders_r'], 'Deltoids': ['shoulders', 'shoulders_r'],
  'Biceps': ['biceps', 'biceps_r'], 'Arms': ['biceps', 'biceps_r'], 'Triceps': ['biceps', 'biceps_r'],
  'Abs': ['abs'], 'Core': ['abs'],
  'Quadriceps': ['quads', 'quads_r'], 'Quads': ['quads', 'quads_r'],
  'Legs': ['quads', 'quads_r', 'calves', 'calves_r'],
  'Hamstrings': ['quads', 'quads_r'],
  'Calves': ['calves', 'calves_r'],
  'Glutes': ['quads', 'quads_r'],
};

export default function MuscleHeatMap({ data, accentColor = '#6C7CFF' }: MuscleHeatMapProps) {
  const maxSets = Math.max(...Object.values(data), 1);

  const getOpacity = (muscleId: string): number => {
    let sets = 0;
    for (const [group, count] of Object.entries(data)) {
      const regions = MUSCLE_MAPPING[group] || [];
      if (regions.includes(muscleId)) sets += count;
    }
    return sets > 0 ? Math.max(0.15, sets / maxSets) : 0.05;
  };

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <h3 className="text-sm font-semibold text-foreground mb-3">Muscle Groups Trained</h3>
      <div className="flex items-center justify-center">
        <svg viewBox="55 65 90 200" className="w-40 h-64">
          <ellipse cx="100" cy="78" rx="15" ry="12" fill="currentColor" opacity={0.08} />
          <rect x="85" y="88" width="30" height="5" rx="2" fill="currentColor" opacity={0.05} />
          {MUSCLE_REGIONS.map((region) => (
            <path key={region.id} d={region.path}
              fill={accentColor}
              fillOpacity={getOpacity(region.id)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth="0.5"
            />
          ))}
        </svg>
        <div className="ml-4 space-y-1.5">
          {Object.entries(data)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([group, sets]) => (
              <div key={group} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: accentColor, opacity: sets / maxSets }} />
                <span className="text-[10px] text-muted-foreground">{group}</span>
                <span className="text-[10px] text-muted-foreground/50 ml-auto">{sets}s</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
