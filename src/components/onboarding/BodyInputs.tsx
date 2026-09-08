import { useEffect, useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import WeightScaleDial from "@/components/home/WeightScaleDial";
import {
  kgToLb,
  lbToKg,
  kgToStonePounds,
  stonePoundsToKg,
} from "@/lib/weightUnits";

type WeightUnit = "kg" | "lbs" | "st";
const valueClass =
  "ds-input w-full min-w-0 min-h-16 text-center text-display font-mono tabular-nums";
const numeric = (text: string) =>
  /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : NaN;

/** Canonical kg/cm change only through input, never unit presentation. No log writes. */
export default function BodyInputs({
  weightKg,
  heightCm,
  weightUnit,
  heightUnit,
  onWeight,
  onHeight,
  onWeightUnit,
  onHeightUnit,
  onValidityChange,
}: {
  weightKg: number;
  heightCm: number;
  weightUnit: WeightUnit;
  heightUnit: "cm" | "ft";
  onWeight: (kg: number) => void;
  onHeight: (cm: number) => void;
  onWeightUnit: (unit: WeightUnit) => void;
  onHeightUnit: (unit: "cm" | "ft") => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const weightText = (kg: number, unit: WeightUnit) =>
    unit === "st"
      ? String(kgToStonePounds(kg).stone)
      : (unit === "lbs" ? kgToLb(kg) : kg).toFixed(1);
  const heightText = (cm: number, unit: "cm" | "ft") =>
    unit === "cm"
      ? String(Number(cm.toFixed(1)))
      : String(Math.floor(Math.round(cm / 2.54) / 12));
  const [weight, setWeight] = useState(() => weightText(weightKg, weightUnit));
  const [pounds, setPounds] = useState(() =>
    String(kgToStonePounds(weightKg).pounds)
  );
  const [height, setHeight] = useState(() => heightText(heightCm, heightUnit));
  const [inches, setInches] = useState(() =>
    String(Math.round(heightCm / 2.54) % 12)
  );
  const [weightValid, setWeightValid] = useState(true);
  const [heightValid, setHeightValid] = useState(true);
  useEffect(
    () => onValidityChange(weightValid && heightValid),
    [weightValid, heightValid, onValidityChange]
  );
  const editWeight = (text: string, remainder: string) => {
    setWeight(text);
    setPounds(remainder);
    const main = numeric(text);
    const remaining = numeric(remainder);
    const kg =
      weightUnit === "st"
        ? stonePoundsToKg(main, remaining)
        : weightUnit === "lbs"
          ? lbToKg(main)
          : main;
    const valid =
      Number.isFinite(kg) &&
      kg >= 30 &&
      kg <= 300 &&
      (weightUnit !== "st" ||
        (Number.isInteger(main) && remaining >= 0 && remaining < 14));
    setWeightValid(valid);
    if (valid) onWeight(kg);
  };
  const editHeight = (text: string, remainder: string) => {
    setHeight(text);
    setInches(remainder);
    const main = numeric(text);
    const remaining = numeric(remainder);
    const cm = heightUnit === "cm" ? main : (main * 12 + remaining) * 2.54;
    const valid =
      Number.isFinite(cm) &&
      cm >= 100 &&
      cm <= 250 &&
      (heightUnit !== "ft" ||
        (Number.isInteger(main) && remaining >= 0 && remaining < 12));
    setHeightValid(valid);
    if (valid) onHeight(cm);
  };
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl bg-card card-shadow p-4 space-y-3"
        aria-label="Starting weight"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Weight</h2>
          <SegmentedControl<WeightUnit>
            ariaLabel="Weight unit"
            className="w-44 shrink-0"
            value={weightUnit}
            disabled={!weightValid}
            options={[
              { value: "kg", label: "kg" },
              { value: "lbs", label: "lb" },
              { value: "st", label: "st" },
            ]}
            onChange={(next) => {
              setWeight(weightText(weightKg, next));
              setPounds(String(kgToStonePounds(weightKg).pounds));
              onWeightUnit(next);
            }}
          />
        </div>
        <div className="flex gap-3">
          <label className="flex-1 min-w-0">
            <span className="sr-only">
              Weight ({weightUnit === "lbs" ? "lb" : weightUnit})
            </span>
            <input
              inputMode="decimal"
              className={valueClass}
              value={weight}
              aria-invalid={!weightValid}
              onChange={(event) => editWeight(event.target.value, pounds)}
            />
            {weightUnit === "st" && (
              <span
                aria-hidden="true"
                className="block text-center text-sm text-muted-foreground"
              >
                st
              </span>
            )}
          </label>
          {weightUnit === "st" && (
            <label className="flex-1 min-w-0">
              <span className="sr-only">Pounds</span>
              <input
                inputMode="decimal"
                className={valueClass}
                value={pounds}
                aria-invalid={!weightValid}
                onChange={(event) => editWeight(weight, event.target.value)}
              />
              <span
                aria-hidden="true"
                className="block text-center text-sm text-muted-foreground"
              >
                lb
              </span>
            </label>
          )}
        </div>
        {!weightValid && (
          <p role="alert" className="text-sm text-destructive-strong">
            Enter 30–300 kg, or the equivalent in pounds.
          </p>
        )}
        <WeightScaleDial
          key={weightUnit}
          unit={weightUnit === "lbs" ? "lb" : weightUnit}
          value={weightUnit === "kg" ? weightKg : kgToLb(weightKg)}
          minimum={weightUnit === "kg" ? 30 : kgToLb(30)}
          maximum={weightUnit === "kg" ? 300 : kgToLb(300)}
          onChange={(value) => {
            const kg = weightUnit === "kg" ? value : lbToKg(value);
            onWeight(kg);
            setWeight(weightText(kg, weightUnit));
            setPounds(String(kgToStonePounds(kg).pounds));
            setWeightValid(true);
          }}
        />
        <p className="text-sm text-muted-foreground">
          Spin the scale or tap the number to type. This sets up your plan; it
          doesn’t log a weigh-in.
        </p>
      </section>
      <section
        className="rounded-2xl bg-card card-shadow p-4 space-y-3"
        aria-label="Height"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Height</h2>
          <SegmentedControl<"cm" | "ft">
            ariaLabel="Height unit"
            className="w-36 shrink-0"
            value={heightUnit}
            disabled={!heightValid}
            options={[
              { value: "cm", label: "cm" },
              { value: "ft", label: "ft / in" },
            ]}
            onChange={(next) => {
              setHeight(heightText(heightCm, next));
              setInches(String(Math.round(heightCm / 2.54) % 12));
              onHeightUnit(next);
            }}
          />
        </div>
        <div className="flex gap-3">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Height ({heightUnit})</span>
            <input
              inputMode="decimal"
              className={valueClass}
              value={height}
              aria-invalid={!heightValid}
              onChange={(event) => editHeight(event.target.value, inches)}
            />
          </label>
          {heightUnit === "ft" && (
            <label className="flex-1 min-w-0">
              <span className="sr-only">Inches</span>
              <input
                inputMode="decimal"
                className={valueClass}
                value={inches}
                aria-invalid={!heightValid}
                onChange={(event) => editHeight(height, event.target.value)}
              />
              <span
                aria-hidden="true"
                className="block text-center text-sm text-muted-foreground"
              >
                in
              </span>
            </label>
          )}
        </div>
        {!heightValid && (
          <p role="alert" className="text-sm text-destructive-strong">
            Enter 100–250 cm, or the equivalent in feet and inches.
          </p>
        )}
      </section>
    </div>
  );
}
