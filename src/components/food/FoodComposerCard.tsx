import type { Ref, RefObject } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Camera, Lock, PenLine, SendHorizontal, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { FoodSuggestion } from "@/lib/nlFoodParser";
import FoodSuggestionsDropdown, {
  type OFFResult,
  type PantrySuggestion,
  type QuickAddSection,
} from "./FoodSuggestionsDropdown";
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
  /** Per-tier cap for the action. 0 = the action is Pro-only for this
   *  tier (not a consumed quota) — the locked scan icon carries that
   *  gate, so the quota caption must NOT render for it. */
  limit: number;
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
  /** Empty-focus Quick Add payload (wave2 D) — non-null only while the
   *  input is focused + empty; forwarded straight to the dropdown. */
  quickAdd?: QuickAddSection | null;
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
 * The Food page's input surface: NL textarea (with scan icon, send
 * button + suggestions dropdown), the conditional quota caption, and
 * the "Add to" meal selector. ONE entry surface — manual logging is
 * contextual (dropdown no-results row), not a standing link.
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
  quickAdd = null,
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
          /* pr-20: room for the always-present scan icon plus the
             contextual send / cancel control beside it. */
          className="w-full pl-10 pr-20 py-3.5 rounded-xl border bg-card text-foreground text-sm resize-none transition-all duration-200 ease-out"
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
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
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
                "p-1.5 relative before:absolute before:-inset-1.5 before:content-[''] rounded-lg transition-all active:scale-90",
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
              className="size-11 inline-flex items-center justify-center rounded-lg active:scale-90 text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          {/* Scan affordance — a camera icon IN the input row (wave2 A),
              replacing the old full-width gradient ScanMealButton card
              section. The coral scan identity travels with the icon
              (DESIGN_GUIDE 3e: #FF6B4A = scan affordance only). Locked
              (quota exhausted / Pro-only) keeps the calm receded
              philosophy: dimmed icon + small lock badge, no glow — tap
              opens the upgrade path via the unchanged
              useScanButtonOverrides contract. */}
          <button
            type="button"
            onClick={() => {
              haptic();
              scanOverrides.onClick();
            }}
            aria-label={
              scanOverrides.locked ? "Unlock unlimited scans" : "Scan your meal"
            }
            className="relative size-11 inline-flex items-center justify-center rounded-lg active:scale-90 transition-transform shrink-0"
            style={{ color: THEME.food.scan }}
          >
            <Camera
              className={cn("size-5", scanOverrides.locked && "opacity-60")}
              strokeWidth={2}
            />
            {scanOverrides.locked && (
              <span
                aria-hidden="true"
                className="absolute bottom-1.5 right-1.5 inline-flex items-center justify-center size-3.5 rounded-full bg-card"
              >
                <Lock className="size-2.5" strokeWidth={2.5} />
              </span>
            )}
          </button>
        </div>
        {showSuggestions && (
          <FoodSuggestionsDropdown
            ref={suggestionsRef}
            suggestions={suggestions}
            offResults={offResults}
            pantryResults={pantryResults}
            quickAdd={quickAdd}
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
      {/* Quota caption (wave2 B) — a single 11px muted line directly under
          the input row, ONLY when a real quota is scarce: a consumable
          limit exists (limit > 0) and remaining <= 1. No standing quota
          furniture when the user has headroom; limit === 0 (Pro-only
          tier) renders nothing because the locked scan icon already
          carries that gate. */}
      {!scanUsage.isUnlimited &&
        !scanUsage.loading &&
        scanUsage.limit > 0 &&
        scanUsage.remaining <= 1 && (
          <div className="mt-1.5">
            <ScanQuotaIndicator
              remaining={scanUsage.remaining}
              resetDate={scanUsage.resetDate}
              onUpgrade={onUpgrade}
            />
          </div>
        )}
      {/* Meal-slot picker — the one single-select control (SegmentedControl,
          ADR-0003): radiogroup semantics, keyboard and 44px targets for free,
          and the same selected-state language as every other picker in the
          app. This row and EditServingsSheet's "Meal slot" were two
          hand-rolled chip rows that painted the same state in two colours
          (nutrition orange here, brand purple there); the label above is the
          DS2 11px section tier. */}
      <div className="mt-2 space-y-1.5">
        <SectionLabel tier="section">Add to</SectionLabel>
        <SegmentedControl
          ariaLabel="Add to meal"
          options={MEAL_ORDER.map((mealKey) => ({
            value: mealKey,
            label: MEAL_LABELS[mealKey],
          }))}
          value={targetMeal}
          onChange={onTargetMeal}
        />
      </div>
      {/* No standing manual-log link (wave2 C). Manual entry remains
          reachable exactly when flows fail the user: the dropdown's
          no-results row (below, via onManualOpen), the AI-failure
          fallback (FoodAnalyzer onRequestManualLog), and the OFF
          search-error toast action — all owned by the parent. */}
    </div>
  );
}

export default FoodComposerCard;
