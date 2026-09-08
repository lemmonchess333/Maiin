// Fun comparisons for share cards

interface Comparison {
  threshold: number;
  unit: string;
  text: (value: number) => string;
}

const DISTANCE_COMPARISONS: Comparison[] = [
  {
    threshold: 0.25,
    unit: "km",
    text: (v) => `That's ${Math.round((v * 1000) / 268)} Tower Bridges long`,
  },
  {
    threshold: 0.1,
    unit: "km",
    text: (v) => `That's ${Math.round((v * 1000) / 100)} football pitches`,
  },
  {
    threshold: 1,
    unit: "km",
    text: (v) => `That's ${Math.round((v * 1000) / 324)} Eiffel Towers stacked`,
  },
  {
    threshold: 0.05,
    unit: "km",
    text: (v) => `That's ${Math.round((v * 1000) / 50)} Olympic pool lengths`,
  },
  {
    threshold: 5,
    unit: "km",
    text: (v) => `That's a ${(v / 8.851).toFixed(1)}× Great Wall section`,
  },
];

export function getDistanceComparison(km: number): string | null {
  const eligible = DISTANCE_COMPARISONS.filter((c) => km >= c.threshold);
  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return pick.text(km);
}
