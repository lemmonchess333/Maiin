import type { Ref, RefObject } from "react";
import { PenLine, SendHorizontal, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { FoodSuggestion } from "@/lib/nlFoodParser";
import FoodSuggestionsDropdown, {
  type OFFResult,
  type PantrySuggestion,
} from "./FoodSuggestionsDropdown";
import ScanMealButton from "./ScanMealButton";
import ScanQuotaIndicator from "./ScanQuotaIndicator";
import { MEAL_ORDER, MEAL_LABELS, type MealKey } from "./mealConstants";

/* Scan button override shape — matches the existing
   useScanButtonOverrides hook return surface in
   src/components/food/scanButtonOverrides.tsx. Kept here as a
   structural type rather than importing the hook's named type so
   FoodComposerCard doesn't pull in the hook itself. */
interface ScanOverrides {
  onClick: () => void;
  /** Quota-exhausted upsell state — drives ScanMealButton's locked look. */
  locked?: boolean;
}

interface ScanUsageSnapshot {
  loading: boolean;
  remaining: number;
  isUnlimited: boolean;
  resetDate: Date;
}

interface FoodComposerCardProps {
  // ── Input state ────────────────────────────────────────────────
  nlInput: string;
  setNlInput: (v: string) => void;
  nlParsing: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  setSuggestionsActive: (v: boolean) => void;
  /** Placeholder string when the input is empty + unfocused +
   *  no target meal. The parent rotates through example strings;
   *  this component just renders whichever one it's handed. */
  placeholderPrompt: string;
  onParse: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  // ── Target meal pills ──────────────────────────────────────────
  targetMeal: MealKey | null;
  setTargetMeal: (v: MealKey | null) => void;
  onTargetMeal: (m: MealKey) => void;
  // ── Suggestions dropdown ──────────────────────────────────────
  showSuggestions: boolean;
  suggestions: FoodSuggestion[];
  offResults: OFFResult[];
  /** F2d PR 4: "Your pantry" matches at the top of the dropdown.
   *  Gate-OFF substring search across the user's full favourites
   *  collection — typing 2+ chars is intent enough; no graduation
   *  filter here. Max 3 enforced upstream. */
  pantryResults: PantrySuggestion[];
  offEmpty: boolean;
  offSearchQuery: string | null;
  onSelectSuggestion: (s: FoodSuggestion) => void;
  onSelectOff: (food: OFFResult) => void;
  onSelectPantry: (p: PantrySuggestion) => void;
  // ── Scan + manual log ─────────────────────────────────────────
  scanUsage: ScanUsageSnapshot;
  scanOverrides: ScanOverrides;
  onUpgrade: () => void;
  onManualOpen: () => void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The Food page's input surface: NL textarea (with send button +
 * suggestions dropdown), "Add to" meal pills, full-width Scan CTA
 * with quota footnote, and the secondary "Log manually" link.
 *
 * Extracted from src/pages/Food.tsx — the page previously inlined
 * ~170 lines of composer markup that wove together five distinct
 * sub-controls. Lifting them into one component cuts the parent
 * down and gives the composer a single review surface; the prop
 * boundary is intentionally wide because the parent owns the
 * orchestrating state (saving, target meal, scan quota, etc.) and
 * we don't want this component duplicating that source of truth.
 *
 * `suggestionsRef` is forwarded so the parent's outside-click
 * dismissal can resolve the dropdown's bounding box without a
 * separate ref handshake. The textarea ref is passed by prop
 * because the parent needs to imperatively `.focus()` it from the
 * scanner-permission-denied fallback path.
 */
function FoodComposerCard({
  nlInput,
  setNlInput,
  nlParsing,
  inputFocused,
  setInputFocused,
  setSuggestionsActive,
  placeholderPrompt,
  onParse,
  inputRef,
  targetMeal,
  setTargetMeal,
  onTargetMeal,
  showSuggestions,
  suggestions,
  offResults,
  pantryResults,
  offEmpty,
  offSearchQuery,
  onSelectSuggestion,
  onSelectOff,
  onSelectPantry,
  scanUsage,
  scanOverrides,
  onUpgrade,
  onManualOpen,
  ref: suggestionsRef,
}: FoodComposerCardProps) {
  return (
    <div className="pb-2">
      <div className="relative">
        <PenLine
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 transition-colors",
            inputFocused ? "" : "text-muted-foreground"
          )}
          style={inputFocused ? { color: THEME.semantic.nutrition } : undefined}
        />
        <textarea
          ref={inputRef}
          value={nlInput}
          onChange={(e) => setNlInput(e.target.value)}
          onFocus={() => {
            setSuggestionsActive(true);
            setInputFocused(true);
          }}
          onBlur={() => {
            setInputFocused(false);
            setTimeout(() => setSuggestionsActive(false), 200);
          }}
          onKeyDown={(e) => {
            // Return / Enter submits. Two-tap confirm when the
            // suggestion dropdown is active so the parser doesn't
            // fire while the user is still mid-selection — first
            // tap dismisses, second tap sends. Mobile-first: no
            // Shift+Enter newline / Escape branch since neither
            // exists on iOS/Android software keyboards.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (showSuggestions) {
              setSuggestionsActive(false);
              return;
            }
            if (!nlInput.trim() || nlParsing) return;
            haptic();
            onParse();
          }}
          placeholder={
            targetMeal
              ? `Adding to ${MEAL_LABELS[targetMeal]}…`
              : placeholderPrompt
          }
          aria-label="What did you eat"
          rows={1}
          maxLength={500}
          className="w-full pl-10 pr-11 py-3.5 rounded-xl border bg-card text-foreground text-sm resize-none transition-all duration-200 ease-out"
          style={{
            borderColor: inputFocused
              ? "var(--ds-color-input-border-focus-nutrition)"
              : "var(--ds-color-input-border-rest)",
            outline: "none",
            boxShadow: inputFocused
              ? "var(--ds-shadow-input-focus-nutrition)"
              : "var(--ds-shadow-input-rest)",
          }}
        />
        {nlInput.trim() && (
          <button
            type="button"
            onClick={() => {
              haptic();
              onParse();
            }}
            disabled={nlParsing}
            aria-label="Log meal"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90",
              nlParsing ? "opacity-50" : ""
            )}
            style={{ color: THEME.semantic.nutrition }}
          >
            <SendHorizontal className="size-5" />
          </button>
        )}
        {!nlInput.trim() && targetMeal && (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setTargetMeal(null);
            }}
            aria-label={`Cancel adding to ${MEAL_LABELS[targetMeal]}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-lg active:scale-90 text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        {showSuggestions && (
          <FoodSuggestionsDropdown
            ref={suggestionsRef}
            suggestions={suggestions}
            offResults={offResults}
            pantryResults={pantryResults}
            offEmpty={offEmpty}
            offSearchQuery={offSearchQuery}
            onSelectSuggestion={onSelectSuggestion}
            onSelectOff={onSelectOff}
            onSelectPantry={onSelectPantry}
            onLogManually={() => {
              haptic();
              onManualOpen();
            }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-caption uppercase tracking-wide text-muted-foreground shrink-0">
          Add to
        </span>
        {MEAL_ORDER.map((mealKey) => {
          const selected = targetMeal === mealKey;
          return (
            <button
              key={mealKey}
              type="button"
              onClick={() => onTargetMeal(mealKey)}
              className={cn(
                /* Visual stays diary-compact (h-8 = 32px) but
                     the tap target hits 44px via a transparent
                     before:pseudo-element extending the click
                     region vertically. Inset-x stays 0 to avoid
                     overlapping adjacent meal pills' tap areas. */
                "relative h-8 px-3.5 rounded-full border text-xs font-medium shrink-0 transition-all active:scale-95 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5",
                selected
                  ? // Selected meal target = the nutrition IDENTITY orange
                    // (--nutrition #D9884E), not the amber -strong step. The
                    // visual audit flagged the amber-brown fill clashing with
                    // the coral paywall + warm nutrition palette around it;
                    // the identity orange sits in-family. Deliberate AA
                    // trade-off: white on #D9884E is ~2.8:1 — accepted for
                    // this one short-label pill by the design call recorded
                    // in the audit (REPORT.md). The meal-section + button
                    // mirrors this exact treatment so the same state reads
                    // as ONE colour everywhere on the Food page.
                    "border-transparent text-white bg-nutrition"
                  : "border-border/80 text-muted-foreground bg-card hover:bg-muted/60"
              )}
              aria-pressed={selected}
            >
              {MEAL_LABELS[mealKey]}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <ScanMealButton
          onClick={() => {
            haptic();
            scanOverrides.onClick();
          }}
          locked={scanOverrides.locked}
        />
        {!scanUsage.isUnlimited && !scanUsage.loading && (
          <div className="mt-2">
            <ScanQuotaIndicator
              remaining={scanUsage.remaining}
              resetDate={scanUsage.resetDate}
              onUpgrade={onUpgrade}
            />
          </div>
        )}
        {/* Manual logging fallback. Centered text-only so it
              doesn't compete with Scan or the NL composer. The
              drawer is the only escape hatch when AI / barcode /
              OFF search all fail to find a match. */}
        <button
          type="button"
          onClick={() => {
            haptic();
            onManualOpen();
          }}
          className="w-full mt-2 min-h-[44px] py-2 text-sm font-medium text-muted-foreground active:scale-[0.98] transition-transform"
          aria-label="Log a meal manually"
        >
          Log manually
        </button>
      </div>
    </div>
  );
}

export default FoodComposerCard;
