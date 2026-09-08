import { useRef, useState } from "react";
import type { UpdateProfileResult } from "@/lib/auth";
import { MIN_TARGET_CALORIES } from "@/lib/macroConstants";
import { Button } from "@/components/ui/Button";

interface Props {
  value?: number;
  calculatedTarget: number;
  onSave: (value: number | undefined) => Promise<UpdateProfileResult>;
}

/** Account-keyed by NutritionSection. Drafts update immediately; persistence
 * happens on blur like the profile fields, never from an abandoned timer. */
export default function CalorieTargetOverride({
  value,
  calculatedTarget,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const revision = useRef(0);

  async function save(next: number | undefined) {
    const submitted = ++revision.current;
    if (next === value) {
      setDraft(null);
      return;
    }
    // The profile boundary owns persistence/error feedback. A result from
    // an earlier edit must not erase text entered while that save was pending.
    await onSave(next);
    if (revision.current === submitted) setDraft(null);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor="tdee-custom-target"
          className="text-sm text-muted-foreground"
        >
          Override daily target (optional)
        </label>
        {!!value && (
          <Button variant="ghost" onClick={() => void save(undefined)}>
            Reset to calculated
          </Button>
        )}
      </div>
      <p
        id="tdee-custom-target-help"
        className="text-xs text-muted-foreground mt-0.5 mb-2"
      >
        Leave blank to use calculated target of{" "}
        <span className="font-mono tabular-nums">{calculatedTarget}</span> cal.
        Changes save when you leave this field.
      </p>
      <input
        id="tdee-custom-target"
        type="number"
        inputMode="numeric"
        min={0}
        max={10000}
        aria-describedby="tdee-custom-target-help"
        value={draft ?? value ?? ""}
        onChange={(e) => {
          revision.current++;
          setDraft(e.target.value);
        }}
        onBlur={(e) => {
          if (draft === null) return;
          if (!e.target.validity.valid) {
            revision.current++;
            setDraft(null);
            return;
          }
          const next = draft === "" ? undefined : Number(draft) || undefined;
          void save(next);
        }}
        placeholder={String(calculatedTarget)}
        className="ds-input w-full font-mono tabular-nums"
      />
      {/* Preserve the owner-approved warning, not clamping, below the
          calculated target floor. The input bounds match profile storage. */}
      {typeof value === "number" &&
        value > 0 &&
        value < MIN_TARGET_CALORIES && (
          <p
            className="text-caption leading-snug mt-2"
            style={{ color: "hsl(var(--warning-strong))" }}
          >
            Below the{" "}
            <span className="font-mono tabular-nums">
              {MIN_TARGET_CALORIES}
            </span>{" "}
            cal floor Tropos uses everywhere else. Your plan will keep this
            figure — very low targets make protein and essential fat hard to
            fit.
          </p>
        )}
    </div>
  );
}
