import { useState } from "react";
import WeightScaleDial from "@/components/home/WeightScaleDial";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatStonePounds, kgToLb, lbToKg } from "@/lib/weightUnits";

/** The production dial, without profile reads or any logging side effects. */
export default function WeightPickerLab() {
  const [kg, setKg] = useState(81.6);
  const [unit, setUnit] = useState<"kg" | "lb" | "st">("kg");
  return (
    <main className="max-w-lg w-full min-w-0 mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Weight scale lab</h1>
      <p className="text-sm text-muted-foreground">
        The production scale dial. Nothing on this page logs a weight.
      </p>
      <SegmentedControl
        ariaLabel="Scale unit"
        value={unit}
        onChange={setUnit}
        options={[
          { value: "kg", label: "kg" },
          { value: "lb", label: "lb" },
          { value: "st", label: "st" },
        ]}
      />
      <p className="text-center text-display font-mono tabular-nums">
        {unit === "st"
          ? formatStonePounds(kg)
          : (unit === "kg" ? kg : kgToLb(kg)).toFixed(1)}
      </p>
      <WeightScaleDial
        key={unit}
        unit={unit}
        value={unit === "kg" ? kg : kgToLb(kg)}
        minimum={unit === "kg" ? 20 : kgToLb(20)}
        maximum={unit === "kg" ? 350 : kgToLb(350)}
        onChange={(value) => setKg(unit === "kg" ? value : lbToKg(value))}
      />
    </main>
  );
}
