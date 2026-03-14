import { useMemo, useState } from "react";

const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT = 20;

const PLATE_COLORS: Record<number, string> = {
  25: "bg-red-500",
  20: "bg-blue-500",
  15: "bg-yellow-500",
  10: "bg-green-500",
  5: "bg-muted border border-border",
  2.5: "bg-red-300",
  1.25: "bg-muted-foreground/40",
};

const PLATE_HEIGHTS: Record<number, number> = {
  25: 48,
  20: 44,
  15: 40,
  10: 36,
  5: 32,
  2.5: 28,
  1.25: 24,
};

function calculatePlates(targetWeight: number): number[] {
  let remaining = (targetWeight - BAR_WEIGHT) / 2;
  if (remaining <= 0) return [];
  const plates: number[] = [];
  for (const plate of PLATE_SIZES) {
    while (remaining >= plate - 0.001) {
      plates.push(plate);
      remaining -= plate;
    }
  }
  return plates;
}

interface Props {
  weight?: number;
  onClose?: () => void;
}

export function PlateCalculator({ weight: initialWeight, onClose }: Props) {
  const [weight, setWeight] = useState(initialWeight ?? 60);

  const plates = useMemo(() => calculatePlates(weight), [weight]);
  const perSide = plates.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Plate Calculator</h3>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Close
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeight((w) => Math.max(BAR_WEIGHT, w - 2.5))}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground font-bold"
        >
          -
        </button>
        <div className="flex-1 text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{weight}kg</p>
          <p className="text-[10px] text-muted-foreground">Bar: {BAR_WEIGHT}kg</p>
        </div>
        <button
          onClick={() => setWeight((w) => w + 2.5)}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground font-bold"
        >
          +
        </button>
      </div>

      {/* Visual plate display */}
      <div className="flex items-center justify-center gap-0.5 py-3">
        {/* Left plates (mirrored) */}
        {[...plates].reverse().map((p, i) => (
          <div
            key={`l-${i}`}
            className={`rounded-sm ${PLATE_COLORS[p] ?? "bg-muted-foreground/40"}`}
            style={{ width: 8, height: PLATE_HEIGHTS[p] ?? 28 }}
          />
        ))}
        {/* Bar */}
        <div className="w-16 h-2 bg-muted-foreground/40 rounded" />
        {/* Right plates */}
        {plates.map((p, i) => (
          <div
            key={`r-${i}`}
            className={`rounded-sm ${PLATE_COLORS[p] ?? "bg-muted-foreground/40"}`}
            style={{ width: 8, height: PLATE_HEIGHTS[p] ?? 28 }}
          />
        ))}
      </div>

      {/* Plate breakdown */}
      {perSide ? (
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Per side:</p>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {plates.map((p, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium text-foreground"
              >
                {p}kg
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center">Bar only ({BAR_WEIGHT}kg)</p>
      )}
    </div>
  );
}
