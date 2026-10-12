import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FoodTimeline from "@/components/food/FoodTimeline";
import { MEALS, type BreakDataset } from "./breakFoodFixtures";

/*
 * DEV/TEST-ONLY break-food lab. Not in production builds; see the route
 * gating in App.tsx (same pattern as BreakSocialLab).
 *
 * The Food diary's timeline, rendered with the day the diary is usually
 * looked at with and with the data real logs produce
 * (breakFoodFixtures.ts). The data swaps at the props, the same boundary
 * Food.tsx fills, so a break here is a break in the component. `?data=`
 * keeps the choice across a reload.
 */
const DATASETS: { key: BreakDataset; label: string }[] = [
  { key: "demo", label: "Demo data" },
  { key: "worst", label: "Worst case" },
  { key: "one", label: "One" },
];

export default function BreakFoodLab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("data");
  const dataset: BreakDataset = raw === "worst" || raw === "one" ? raw : "demo";
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 space-y-6">
      <header className="space-y-1">
        <h1 className="text-h2 font-extrabold">Break food</h1>
        <p className="text-small text-muted-foreground">
          The food diary with{" "}
          {DATASETS.find((d) => d.key === dataset)?.label.toLowerCase()}.
        </p>
      </header>

      <section aria-label="Food diary">
        <FoodTimeline
          key={dataset}
          meals={MEALS[dataset]}
          openRowId={openRowId}
          setOpenRowId={setOpenRowId}
          onDelete={() => {}}
          onEdit={() => {}}
        />
      </section>

      {/* Chrome, not design: plain and fixed, out of the way. */}
      <div
        role="radiogroup"
        aria-label="Data"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 rounded-full bg-muted p-1 font-sans text-xs shadow"
      >
        {DATASETS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={dataset === d.key}
            onClick={() => setParams({ data: d.key }, { replace: true })}
            className={`rounded-full px-3 py-1.5 ${
              dataset === d.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
