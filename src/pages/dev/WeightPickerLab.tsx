import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { haptic } from "@/lib/haptic";
import { kgToLb, lbToKg } from "@/lib/weightUnits";
import { isNativePlatform } from "@/lib/platform";

const START_KG = 81.6;
const OFFSETS = [-2.3, -0.4, 0.1, 1.7, 6];
type Unit = "kg" | "lb";
type Picker = "ruler" | "wheel";
const toDisplay = (kg: number, unit: Unit) => (unit === "lb" ? kgToLb(kg) : kg);
const fromDisplay = (value: number, unit: Unit) =>
  unit === "lb" ? lbToKg(value) : value;
const tenth = (value: number) => Math.round(value * 10) / 10;

function Ruler({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const minimum = 40;
  const maximum = 350;
  const stepWidth = 12;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offset = (value - minimum) * 10 * stepWidth;
    if (Math.abs(el.scrollLeft - offset) > stepWidth / 2)
      el.scrollLeft = offset;
  }, [value]);
  return (
    <div className="relative">
      <div
        className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary pointer-events-none z-10"
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="slider"
        aria-label="Ruler weight"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={value}
        tabIndex={0}
        className="h-24 flex overflow-x-auto overflow-y-hidden motion-safe:snap-x motion-safe:snap-mandatory focus-visible:ring-2 focus-visible:ring-primary"
        style={{ paddingInline: "calc(50% - 6px)", scrollbarWidth: "none" }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            onChange(
              Math.min(
                maximum,
                Math.max(
                  minimum,
                  tenth(value + (event.key === "ArrowRight" ? 0.1 : -0.1))
                )
              )
            );
          }
        }}
        onScroll={(event) => {
          const next = tenth(
            minimum + event.currentTarget.scrollLeft / stepWidth / 10
          );
          if (next !== value) {
            haptic("light");
            onChange(next);
          }
        }}
      >
        {Array.from({ length: (maximum - minimum) * 10 + 1 }, (_, index) => (
          <div
            key={index}
            className="shrink-0 snap-center flex flex-col items-center pt-4"
            style={{ width: stepWidth }}
            aria-hidden="true"
          >
            <div
              className={
                index % 10 === 0
                  ? "h-8 border-l border-foreground"
                  : "h-4 border-l border-border"
              }
            />
            {index % 10 === 0 && (
              <span className="mt-2 text-xs font-mono tabular-nums text-muted-foreground">
                {minimum + index / 10}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (ref.current && Math.abs(ref.current.scrollTop - selected * 44) > 22)
      ref.current.scrollTop = selected * 44;
  }, [selected]);
  return (
    <div className="relative flex-1 min-w-0">
      <div
        className="pointer-events-none absolute inset-x-0 top-11 h-11 border-y border-primary"
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${selected}`}
        tabIndex={0}
        className="h-33 overflow-y-auto py-11 motion-safe:snap-y motion-safe:snap-mandatory focus-visible:ring-2 focus-visible:ring-primary"
        style={{ scrollbarWidth: "none" }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            onSelect(
              Math.min(
                values.length - 1,
                Math.max(0, selected + (event.key === "ArrowDown" ? 1 : -1))
              )
            );
          }
        }}
        onScroll={(event) => {
          const next = Math.min(
            values.length - 1,
            Math.max(0, Math.round(event.currentTarget.scrollTop / 44))
          );
          if (next !== selected) {
            haptic("light");
            onSelect(next);
          }
        }}
      >
        {values.map((value, index) => (
          <div
            id={`${id}-${index}`}
            key={value}
            role="option"
            aria-selected={index === selected}
            className="h-11 snap-center"
          >
            <Button
              variant="ghost"
              tabIndex={-1}
              fullWidth
              className="h-11 min-h-11 p-0"
              onClick={() => onSelect(index)}
            >
              <span
                className={label === "Unit" ? "" : "font-mono tabular-nums"}
              >
                {value}
              </span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Trial {
  picker: Picker;
  task: number;
  targetKg: number;
  unit: Unit;
  gestures: number;
  elapsedMs: number;
  overshoots: number;
  platform: string;
}

function TrialPanel({
  picker,
  onRecord,
  onRate,
}: {
  picker: Picker;
  onRecord: (trial: Trial) => void;
  onRate: (rating: number) => void;
}) {
  const [kg, setKg] = useState(START_KG);
  const [unit, setUnit] = useState<Unit>("kg");
  const [task, setTask] = useState(0);
  const [running, setRunning] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const started = useRef(0);
  const lastWheelAt = useRef(0);
  const gestures = useRef(0);
  const overshoots = useRef(0);
  const previousError = useRef(0);
  const targetKg = START_KG + (OFFSETS[task] ?? 0);
  const display = tenth(toDisplay(kg, unit));
  const target = tenth(toDisplay(targetKg, unit));
  const correct =
    task === OFFSETS.length
      ? unit === "lb" && display === target
      : display === target;
  const change = (value: number) => {
    const error = value - target;
    if (running && error * previousError.current < 0) overshoots.current++;
    previousError.current = error;
    setKg(fromDisplay(value, unit));
  };
  const start = () => {
    setKg(START_KG);
    setUnit("kg");
    gestures.current = 0;
    overshoots.current = 0;
    previousError.current = START_KG - targetKg;
    started.current = performance.now();
    setRunning(true);
  };
  const finish = () => {
    if (!running || !correct) return;
    onRecord({
      picker,
      task: task + 1,
      targetKg,
      unit,
      gestures: gestures.current,
      elapsedMs: Math.round(performance.now() - started.current),
      overshoots: overshoots.current,
      platform: isNativePlatform() ? "Capacitor" : "web",
    });
    setRunning(false);
    setTask(task + 1);
  };
  return (
    <section className="ds-card p-4 space-y-4" aria-label={`${picker} trial`}>
      <h2 className="text-lg font-semibold">
        {picker === "ruler" ? "Horizontal ruler" : "Three-column wheel"}
      </h2>
      {task <= OFFSETS.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {task === OFFSETS.length ? (
              "Switch from kg to lb, keeping the same weight"
            ) : (
              <>
                Reach{" "}
                <span className="font-mono tabular-nums">
                  {target.toFixed(1)}
                </span>{" "}
                {unit}
              </>
            )}
          </p>
          <p className="text-center">
            <span className="text-4xl font-mono tabular-nums">
              {display.toFixed(1)}
            </span>{" "}
            {unit}
          </p>
          <div
            onWheelCapture={() => {
              const now = performance.now();
              if (running && now - lastWheelAt.current > 160)
                gestures.current++;
              lastWheelAt.current = now;
            }}
            onPointerDownCapture={() => {
              if (running) gestures.current++;
            }}
            onKeyDownCapture={(event) => {
              if (
                running &&
                [
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                  "Enter",
                  " ",
                ].includes(event.key)
              )
                gestures.current++;
            }}
          >
            {picker === "ruler" ? (
              <>
                <Ruler value={display} onChange={change} />
                <SegmentedControl
                  ariaLabel="Ruler unit"
                  options={[
                    { value: "kg", label: "kg" },
                    { value: "lb", label: "lb" },
                  ]}
                  value={unit}
                  onChange={setUnit}
                />
              </>
            ) : (
              <div className="flex gap-2">
                <SnapColumn
                  label="Whole weight"
                  values={Array.from({ length: 311 }, (_, index) =>
                    String(index + 40)
                  )}
                  selected={Math.floor(display) - 40}
                  onSelect={(index) => change(index + 40 + tenth(display % 1))}
                />
                <SnapColumn
                  label="Tenths"
                  values={Array.from({ length: 10 }, (_, index) =>
                    String(index)
                  )}
                  selected={Math.round((display % 1) * 10)}
                  onSelect={(index) => change(Math.floor(display) + index / 10)}
                />
                <SnapColumn
                  label="Unit"
                  values={["kg", "lb"]}
                  selected={unit === "kg" ? 0 : 1}
                  onSelect={(index) => setUnit(index === 0 ? "kg" : "lb")}
                />
              </div>
            )}
          </div>
          <Button
            fullWidth
            onClick={running ? finish : start}
            disabled={running && !correct}
          >
            {running ? "Confirm target" : "Start task"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">Did you feel in control?</p>
          <SegmentedControl
            ariaLabel={`${picker} control rating`}
            options={[1, 2, 3, 4, 5].map((value) => ({
              value,
              label: <span className="font-mono tabular-nums">{value}</span>,
            }))}
            value={rating}
            onChange={(value) => {
              setRating(value);
              onRate(value);
            }}
          />
          <p className="text-sm text-muted-foreground">
            Record this rating with the participant's trial results.
          </p>
        </>
      )}
    </section>
  );
}

/** Research fixture only: never writes a weigh-in, profile, or analytics event. */
export default function WeightPickerLab() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [wheelFirst, setWheelFirst] = useState(false);
  const [ratings, setRatings] = useState<Partial<Record<Picker, number>>>({});
  const exportResults = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ schema: 1, trials, ratings }, null, 2)], {
        type: "application/json",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "weight-picker-trial.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6 bg-background text-foreground">
      <h1 className="text-2xl font-bold">Weight picker lab</h1>
      <p className="text-sm text-muted-foreground">
        Five target weights and one unit switch per control. Use a fresh reload
        for each participant; alternate which control comes first. The example
        weight does not use account data.
      </p>
      <Button
        variant="secondary"
        disabled={trials.length > 0}
        onClick={() => setWheelFirst(!wheelFirst)}
      >
        Reverse control order
      </Button>
      <div className="grid gap-6 md:grid-cols-2">
        {(wheelFirst
          ? (["wheel", "ruler"] as const)
          : (["ruler", "wheel"] as const)
        ).map((picker) => (
          <TrialPanel
            key={picker}
            picker={picker}
            onRate={(rating) =>
              setRatings((previous) => ({ ...previous, [picker]: rating }))
            }
            onRecord={(trial) => setTrials((previous) => [...previous, trial])}
          />
        ))}
      </div>
      <Button
        variant="secondary"
        disabled={!trials.length}
        onClick={exportResults}
      >
        Export recorded trials
      </Button>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr>
              {["Control", "Task", "Gestures", "Seconds", "Overshoots"].map(
                (label) => (
                  <th key={label} className="p-2">
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {trials.map((trial) => (
              <tr key={`${trial.picker}-${trial.task}`}>
                <td className="p-2">{trial.picker}</td>
                {[
                  trial.task,
                  trial.gestures,
                  (trial.elapsedMs / 1000).toFixed(2),
                  trial.overshoots,
                ].map((value, index) => (
                  <td key={index} className="p-2 font-mono tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
