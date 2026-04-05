import { Flame, Beef, Wheat, Cookie } from "lucide-react";
import type { MacroKey } from "@/lib/theme";
import MacroCard from "./MacroCard";

const macroConfig: Record<MacroKey, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  suffix: string;
}> = {
  calories: { icon: Flame, label: "kcal", suffix: "" },
  protein: { icon: Beef, label: "protein", suffix: "g" },
  carbs: { icon: Wheat, label: "carbs", suffix: "g" },
  fat: { icon: Cookie, label: "fat", suffix: "g" },
};

interface MacroRowProps {
  macros: MacroKey[];
  dailyTotals: Record<MacroKey, number>;
  macroTargets: Record<MacroKey, number>;
}

export default function MacroRow({ macros, dailyTotals, macroTargets }: MacroRowProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {macros.map((key) => {
        const config = macroConfig[key];
        return (
          <MacroCard
            key={key}
            macroKey={key}
            icon={config.icon}
            consumed={dailyTotals[key]}
            target={macroTargets[key]}
            label={config.label}
            suffix={config.suffix}
          />
        );
      })}
    </div>
  );
}
