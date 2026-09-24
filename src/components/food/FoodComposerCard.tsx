import type { ReactNode, Ref, RefObject } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Camera, PenLine, SendHorizontal } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
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
import {
  MEAL_ORDER,
  MEAL_LABELS,
  MEAL_PICKER_LAYOUT,
  type MealKey,
} from "./mealConstants";

/* Scan button override shape — matches the existing
   useScanButtonOverrides hook return surface in
   src/components/food/scanButtonOverrides.tsx. Kept here as a
   structural type rather than importing the hook's named type so
   FoodComposerCard doesn't pull in the hook itself. */
interface ScanOverrides {
  /** `origin` is the button's box when tapped: the scanner grows out of
   *  it. */
  onClick: (origin?: DOMRect) => void;
  /** No photo scans on this tier. The button looks the same either way;
   *  the page hands this to the scanner, which opens on Barcode. */
  locked?: boolean;
}

interface ScanUsageSnapshot {
  loading: boolean;
  remaining: number;
  /** Per-tier cap for the action. 0 = the action is Pro-only for this
   *  tier (not a consumed quota) — the scanner's photo tabs carry that
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
  /** Placeholder string when the input is empty. The parent rotates
   *  through example strings; this component just renders whichever
   *  one it's handed. The meal pills above the field say where a log
   *  goes, so the placeholder no longer repeats it ("Adding to
   *  Snacks…") — it shows what a log can look like instead. */
  placeholderPrompt: string;
  onParse: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  // ── Target meal pills ──────────────────────────────────────────
  targetMeal: MealKey | null;
  /** Tap a pill to target that meal; tap the selected pill to clear
   *  it. That toggle is the ONLY way out of a target now — the field
   *  had carried a cancel X beside the camera, and an X in an empty
   *  field reads as "clear", which cleared nothing visible. */
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
  /** Rendered directly under the field — the page passes the Pro hint
   *  (FoodProHint) here, so it sits with the control it explains
   *  rather than as a card above the composer. */
  proHint?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The Food page's input surface, in the order a person acts: the meal
 * pills (which meal), then the NL textarea (what) with the manual-entry
 * pencil leading it, the send button trailing and the Scan button beside
 * it, then the suggestions dropdown and the conditional quota caption /
 * Pro hint.
 *
 * It was one sentence in three places — "Adding to Snacks…" in
 * the field, the meal 50px below under an ADD TO caption, and an
 * "Enter manually" ghost button floating alone beneath that. Owner
 * call from the Food options page (5a): pills head the field, the
 * pencil IS the manual-entry button it already looked like, and the
 * caption, the X and the orphan button go. The pills keep their solid
 * nutrition emphasis — the food surface's one colour, a recorded keep.
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
  proHint,
  ref: suggestionsRef,
}: FoodComposerCardProps) {
  return (
    <div className="pb-2">
      {/* Meal-slot picker — SegmentedControl (ADR-0003) for the radiogroup
          semantics, keyboard handling and 44px targets, in its `solid`
          emphasis so the selected slot is a filled orange pill. The orange
          is load-bearing: it is the food domain's identity, it matches the
          meal-section add button, and "which meal" therefore reads as one
          colour across the surface. The neutral track that briefly replaced
          it made this the only domain in the app with no colour of its own.
          EditServingsSheet's "Meal slot" mirrors this exactly.

          It HEADS the field: pick the meal, then say what. No caption —
          four meal names above an input are self-describing. */}
      <SegmentedControl
        emphasis="solid"
        tone="nutrition"
        ariaLabel="Add to meal"
        className={cn("mb-2", MEAL_PICKER_LAYOUT)}
        options={MEAL_ORDER.map((mealKey) => ({
          value: mealKey,
          label: MEAL_LABELS[mealKey],
        }))}
        value={targetMeal}
        onChange={onTargetMeal}
      />
      <div className="relative">
        {/* The field and the Scan button share a row; the dropdown sits
            below both at the row's full width, outside the flex row so
            it can never stretch the button. */}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            {/* The pencil is the manual-entry control — a 44px button
                leading the field, where it had been a decorative glyph
                beside a ghost "Enter manually" button two rows down. The
                dropdown's no-results row still offers the same path. */}
            <button
              type="button"
              onClick={() => {
                haptic();
                setSuggestionsActive(false);
                onManualOpen();
              }}
              aria-label="Enter manually"
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-lg active:scale-90 transition-all",
                inputFocused ? "" : "text-muted-foreground"
              )}
              style={
                inputFocused ? { color: THEME.semantic.nutrition } : undefined
              }
            >
              <PenLine className="size-4" />
            </button>
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
              placeholder={placeholderPrompt}
              aria-label="What did you eat"
              rows={1}
              maxLength={500}
              /* h-14: the camera button's height, so the two read as one
                 row. Left to rows={1}, the field sizes itself to one
                 20px line plus padding, 50px, and the 56px button hangs
                 6px below it. py-[17px] centres that one line in the
                 56px box (1 + 17 + 20 + 17 + 1), level with the pencil
                 and the send button, which centre on the row. `block`,
                 because an inline textarea sits on a text baseline and
                 leaves a gap under it that makes the row taller than
                 either.

                 pl-11: the manual-entry pencil's 44px box. The right
                 edge clears the send button only while there is text
                 for it to send (the one time it shows): beside the
                 camera button the field is narrower, and an empty field
                 needs that width for its placeholder. */
              className={cn(
                "block h-14 w-full pl-11 py-[17px] rounded-xl border bg-card text-foreground text-sm resize-none transition-all duration-200 ease-out",
                nlInput.trim() ? "pr-11" : "pr-3"
              )}
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
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
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
              </div>
            )}
          </div>
          {/* Scan — a filled camera button beside the field, a square the
              height of the field, not an icon inside it. Photo scanning is
              one of the page's main actions, and a 20px grey icon in the
              text box read as decoration. A filled square carries that on
              its own; the word "Scan" beside a camera read as two
              different actions (owner call), and a camera next to a text
              box is the familiar "or send a photo" pattern. VoiceOver
              hears "Scan a meal". It is the only camera on the page.

              Food orange, the `nutrition` variant: an owner call recorded
              in CLAUDE.md's Button mapping. Coral stays inside the
              scanner.

              Every account gets the same button. A locked account (no
              photo scans on its tier) opens the scanner on Barcode, which
              is free, and the photo tabs there carry the Pro offer — the
              scanner reads `scanOverrides.locked`, not this button. The
              tap hands over the button's box, which the scanner grows
              out of. */}
          <IconButton
            variant="nutrition"
            size="lg"
            aria-label="Scan a meal"
            icon={<Camera className="size-6" />}
            onClick={(e) => {
              haptic();
              scanOverrides.onClick(e.currentTarget.getBoundingClientRect());
            }}
            className="size-14 self-center"
          />
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
      {proHint}
      {/* Quota caption (wave2 B) — a single 11px muted line directly under
          the input row, ONLY when a real quota is scarce: a consumable
          limit exists (limit > 0) and remaining <= 1. No standing quota
          furniture when the user has headroom; limit === 0 (Pro-only
          tier) renders nothing because the scanner's photo tabs carry
          that gate. */}
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
    </div>
  );
}

export default FoodComposerCard;
