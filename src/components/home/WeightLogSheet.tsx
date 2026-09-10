import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import WeightScaleDial from "./WeightScaleDial";
import { ChevronDown } from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { format, subDays } from "date-fns";
import { formatDayMonth } from "@/utils/formatters";
import {
  kgToLb,
  lbToKg,
  kgToStonePounds,
  stonePoundsToKg,
  formatWeightInUnit,
} from "@/lib/weightUnits";
import { localDateString } from "@/lib/dateHelpers";
import {
  parseWeightEntry,
  validWeightDate,
  readWeightCorrection,
} from "@/lib/weightEntry";
import {
  queueWeightEntry,
  pendingWeights,
  queueWeightCorrection,
  flushQueuedWeights,
  weightSyncFailed,
} from "@/lib/weightQueue";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

// A scale readout shares the input primitive's editing behavior. Its
// resting surface is unboxed; the surrounding group owns the focus ring.
// Inline styles intentionally override the unlayered ds-input surface.
const readoutStyle = {
  background: "transparent",
  borderColor: "transparent",
  boxShadow: "none",
};

export default function WeightLogSheet({
  uid,
  unit,
  initialKg,
  lastLoggedDate,
  onClose,
}: {
  uid: string;
  unit: "kg" | "lbs";
  initialKg?: number;
  lastLoggedDate?: string | null;
  onClose: () => void;
}) {
  type DisplayUnit = "kg" | "lbs" | "st";
  const [selectedUnit, setSelectedUnit] = useState<DisplayUnit>(unit);
  const initial = initialKg
    ? selectedUnit === "st"
      ? String(kgToStonePounds(initialKg).stone)
      : formatWeightInUnit(initialKg, selectedUnit)
    : "";
  const [pounds, setPounds] = useState(
    initialKg ? String(kgToStonePounds(initialKg).pounds) : "0"
  );
  const minimumDate = localDateString(subDays(new Date(), 30));
  /* Derived from `date`, never stored alongside it: a second source for
     "which day" is how a picker ends up showing Tuesday while the
     control still reads Today. */
  const todayKey = localDateString();
  const [value, setValue] = useState(initial);
  const [date, setDate] = useState(localDateString);
  const [showDate, setShowDate] = useState(false);
  const [correction, setCorrection] = useState<{
    kg: number;
    editId: string | null;
    removesEntry: boolean;
  } | null>(null);
  const [entryDate, setEntryDate] = useState<string | null>(
    lastLoggedDate ?? null
  );
  const [loadingEntry, setLoadingEntry] = useState(true);
  const editing = entryDate === date;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [preciseKg, setPreciseKg] = useState<number | null>(initialKg ?? null);

  /**
   * B0 effort instrumentation. `interactions` counts CONTROL CHANGES, not
   * literal screen taps — a dial drag registers per settled value and a run
   * of typing registers per keystroke. It is a within-path trend, so
   * comparing a dialled save against a typed one by this number alone would
   * be reading noise; `typed` / `picker` are what separate the paths.
   */
  // Stamped in the mount effect, not at useRef(Date.now()): an impure call
  // during render trips react-hooks/purity, and the same workaround is
  // already the house pattern for Food's render-timing ref.
  const openedAt = useRef(0);
  const interactions = useRef(0);
  const typedRef = useRef(false);
  const pickerRef = useRef(false);
  const noteInteraction = () => {
    interactions.current += 1;
  };
  useEffect(() => {
    openedAt.current = Date.now();
    trackHomeEvent("weight_sheet_open");
  }, []);
  const parsedKg = () => {
    if (preciseKg !== null) return preciseKg;
    if (selectedUnit !== "st") return parseWeightEntry(value, selectedUnit);
    if (!/^\d+$/.test(value) || !/^\d+(?:[.,]\d+)?$/.test(pounds)) return null;
    const remaining = Number(pounds.replace(",", "."));
    if (remaining < 0 || remaining >= 14) return null;
    const kg = stonePoundsToKg(Number(value), remaining);
    return kg >= 20 && kg <= 350 ? kg : null;
  };
  const changeUnit = (next: DisplayUnit) => {
    noteInteraction();
    const kg = parsedKg();
    if (kg !== null) {
      const stone = kgToStonePounds(kg);
      setValue(
        next === "st" ? String(stone.stone) : formatWeightInUnit(kg, next)
      );
      setPounds(String(stone.pounds));
      setPreciseKg(kg);
    }
    setSelectedUnit(next);
    setError("");
  };
  const dialKg = parsedKg() ?? initialKg ?? 80;
  /* What changed since the last weigh-in. `initialKg` and
     `lastLoggedDate` describe the SAME entry, so the comparison is
     either well-formed or absent — never a value against another day's
     date.

     Deliberately UNCOLOURED. Down is good for a cutter and bad for a
     lean bulker, and this sheet never reads `program.goal`; a success or
     destructive tint would moralise a number it has no basis to judge.

     The drum shows about four units either side of the reading, so it
     cannot itself catch a fat-fingered entry that is tens of kilos out.
     "+16.4 kg vs 24 Aug" is the stronger form of that check, and unlike
     the scale it survives typing — which is exactly when the keyboard
     shrinks the sheet and pushes the drum out of view. */
  const deltaCaption = (() => {
    if (initialKg === undefined) return "First weigh-in";
    const entered = parsedKg();
    if (entered === null) return null;
    const shown =
      selectedUnit === "kg" ? entered - initialKg : kgToLb(entered - initialKg);
    const suffix = selectedUnit === "kg" ? "kg" : "lb";
    const when =
      lastLoggedDate && lastLoggedDate !== todayKey
        ? formatDayMonth(new Date(`${lastLoggedDate}T12:00:00`))
        : "your last weigh-in";
    if (Math.abs(shown) < 0.05) return `Same as ${when}`;
    // U+2212, which VoiceOver announces as "minus" rather than "dash".
    return `${shown > 0 ? "+" : "\u2212"}${Math.abs(shown).toFixed(1)} ${suffix} vs ${when}`;
  })();
  const changeDial = (amount: number) => {
    pickerRef.current = true;
    noteInteraction();
    const kg = selectedUnit === "kg" ? amount : lbToKg(amount);
    setPreciseKg(kg);
    const stone = kgToStonePounds(kg);
    setValue(selectedUnit === "st" ? String(stone.stone) : amount.toFixed(1));
    setPounds(String(stone.pounds));
    setError("");
  };
  const save = async () => {
    if (pending.current) return;
    // An untouched display preserves the precise canonical value.
    const kg = parsedKg();
    if (kg === null || kg === undefined) {
      setError(
        "Enter a valid weight between 20 and 350 kg, or the equivalent in pounds."
      );
      return;
    }
    if (!validWeightDate(date) || date < minimumDate) {
      setError("Choose a day within the last 30 days.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      queueWeightEntry(uid, date, kg);
      trackHomeEvent("weight_log_saved", {
        taps: interactions.current,
        typed: typedRef.current,
        picker: pickerRef.current,
        unit: selectedUnit,
        // 0 only if a save somehow beat the mount effect; treated as
        // unknown rather than reported as an instantaneous log.
        ...(openedAt.current > 0
          ? { durationMs: Math.round(Date.now() - openedAt.current) }
          : {}),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && !("code" in err)
          ? err.message
          : "Couldn't save your weight. Check your connection and try again."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const correct = () => {
    if (!correction?.editId || pending.current) return;
    try {
      queueWeightCorrection(uid, date, correction.kg, correction.editId);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save this correction."
      );
    }
  };
  useEffect(() => {
    let cancelled = false;
    const interactionsAtLoad = interactions.current;
    const queued = pendingWeights(uid)
      .filter((item) => item.date === date)
      .at(-1);
    Promise.resolve(
      queued
        ? queued.undoOf
          ? null
          : { kg: queued.kg, editId: queued.id, removesEntry: false }
        : readWeightCorrection(uid, date)
    )
      .then((entry) => {
        if (cancelled) return;
        if (
          entry &&
          !typedRef.current &&
          !pickerRef.current &&
          interactions.current === interactionsAtLoad
        ) {
          setPreciseKg(entry.kg);
          setValue(
            selectedUnit === "st"
              ? String(kgToStonePounds(entry.kg).stone)
              : formatWeightInUnit(entry.kg, selectedUnit)
          );
          setPounds(String(kgToStonePounds(entry.kg).pounds));
        }
        setCorrection(entry);
        setEntryDate(entry ? date : null);
        setLoadingEntry(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingEntry(false);
        setError("Couldn't load the saved entry. You can still log a weight.");
      });
    return () => {
      cancelled = true;
    };
  }, [uid, date, selectedUnit]);
  return (
    <BottomSheet
      open
      title={editing ? "Edit weight" : "Log weight"}
      dismissible={!saving}
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-3">
        <div className="flex items-baseline justify-center gap-1 py-2">
          <div
            className="min-w-0 rounded-xl text-display font-mono font-extrabold tabular-nums"
            style={{
              width: `${Math.max(3, Math.min(7, value.length)) + 0.5}ch`,
            }}
          >
            <label htmlFor="weight-value" className="sr-only">
              Weight ({selectedUnit === "lbs" ? "lb" : selectedUnit})
            </label>
            <input
              id="weight-value"
              inputMode="decimal"
              placeholder="—"
              className="ds-input h-16 min-w-0 px-1 py-0 text-center text-display font-extrabold font-mono tabular-nums"
              style={readoutStyle}
              value={value}
              disabled={saving}
              aria-invalid={!!error}
              aria-describedby={error ? "weight-error" : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setPreciseKg(null);
                typedRef.current = true;
                noteInteraction();
                setError("");
              }}
            />
          </div>
          {/* No `focus-within` ring. It matches whenever a descendant has
              focus — INCLUDING after a touch tap — so tapping the unit
              on a phone drew a heavy 2px primary box around it, which is
              what the owner saw. It was also redundant: index.css's
              global `:focus-visible` already gives every focusable
              element a 2px primary outline at 4.47:1, and its
              `:focus:not(:focus-visible)` companion suppresses that for
              pointer and touch. Removing this loses no keyboard
              indicator; it only stops the one that should never have
              fired on a tap. */}
          <div className="relative w-16 shrink-0 rounded-xl">
            <select
              aria-label="Weight unit"
              value={selectedUnit}
              onChange={(event) =>
                changeUnit(event.target.value as DisplayUnit)
              }
              disabled={saving}
              className="ds-input appearance-none pl-1 pr-6 text-lg"
              style={{ ...readoutStyle, color: "hsl(var(--muted-foreground))" }}
            >
              <option value="kg">kg</option>
              <option value="lbs">lb</option>
              <option value="st">st</option>
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          {selectedUnit === "st" && (
            <div
              className="min-w-0 rounded-xl text-display font-mono font-extrabold tabular-nums"
              style={{
                width: `${Math.max(3, Math.min(5, pounds.length)) + 0.5}ch`,
              }}
            >
              <label htmlFor="weight-pounds" className="sr-only">
                Pounds
              </label>
              <input
                id="weight-pounds"
                className="ds-input h-16 min-w-0 px-1 py-0 text-center text-display font-extrabold font-mono tabular-nums"
                style={readoutStyle}
                inputMode="decimal"
                value={pounds}
                disabled={saving}
                onChange={(event) => {
                  noteInteraction();
                  setPounds(event.target.value);
                  setPreciseKg(null);
                  setError("");
                }}
              />
            </div>
          )}
          {selectedUnit === "st" && (
            <span className="text-lg text-muted-foreground">lb</span>
          )}
        </div>
        {deltaCaption && (
          <p className="mb-2 text-center text-small text-muted-foreground">
            <InlineNumerals>{deltaCaption}</InlineNumerals>
          </p>
        )}
        <div className="mx-auto w-full max-w-sm">
          <WeightScaleDial
            key={selectedUnit}
            value={selectedUnit === "kg" ? dialKg : kgToLb(dialKg)}
            minimum={selectedUnit === "kg" ? 20 : kgToLb(20)}
            maximum={selectedUnit === "kg" ? 350 : kgToLb(350)}
            unit={selectedUnit === "lbs" ? "lb" : selectedUnit}
            disabled={saving}
            onChange={changeDial}
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Date</span>
            <Button
              variant="ghost"
              onClick={() => setShowDate((shown) => !shown)}
              disabled={saving}
              aria-expanded={showDate}
            >
              {date === todayKey
                ? "Today"
                : format(new Date(`${date}T12:00:00`), "d MMM yyyy")}
            </Button>
          </div>
          {showDate && (
            <input
              aria-label="Date measured"
              type="date"
              className="ds-input min-h-11 w-full"
              value={date}
              min={minimumDate}
              max={todayKey}
              disabled={saving}
              onChange={(event) => {
                noteInteraction();
                setDate(event.target.value);
                setLoadingEntry(true);
                setCorrection(null);
                setError("");
              }}
            />
          )}
          {error && (
            <p
              id="weight-error"
              role="alert"
              className="text-sm text-destructive-strong"
            >
              {error}
            </p>
          )}
          {weightSyncFailed(uid) && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => void flushQueuedWeights(uid)}
            >
              Retry sync
            </Button>
          )}
          {saving && (
            <p role="status" className="text-sm text-muted-foreground">
              Saving weight…
            </p>
          )}
          <div className="space-y-1">
            <Button
              fullWidth
              loading={saving}
              /* One word, both states. The sheet's own title already
                 says "Log weight" / "Edit weight", so the button was
                 repeating the noun to say what the header said — and
                 "Save changes" framed a weigh-in as a form submission
                 rather than as logging something. */
              aria-label="Log"
              onClick={() => void save()}
            >
              Log
            </Button>
            {!loadingEntry && correction?.editId && (
              <Button
                variant="ghost"
                fullWidth
                disabled={saving}
                onClick={correct}
              >
                {/* One word for one gesture. This is not a general
                    delete: `readWeightCorrection` returns an editId
                    only while a recent write receipt exists, so the
                    action is always "undo the last write". Undoing a
                    create removes the entry; undoing an edit restores
                    the previous figure. Forking the label on that
                    distinction names an implementation detail the user
                    did not choose, and "Remove" overstates half of it. */}
                Undo
              </Button>
            )}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
