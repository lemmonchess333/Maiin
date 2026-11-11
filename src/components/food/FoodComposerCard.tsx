import {
  useEffect,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Camera, PenLine, SendHorizontal } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { FoodSuggestion } from "@/lib/nlFoodParser";
import FoodSuggestionsDropdown, {
  type OFFResult,
  type PantrySuggestion,
  type QuickAddSection,
} from "./FoodSuggestionsDropdown";
import ScanQuotaIndicator from "./ScanQuotaIndicator";

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
   *  one it's handed: what a log can look like. */
  placeholderPrompt: string;
  onParse: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
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
 * The Food page's input surface: one field holding the manual-entry
 * pencil, the NL textarea (what was eaten) with the send button trailing
 * it, and the camera at its end; then the suggestions dropdown and the
 * conditional quota caption / Pro hint.
 *
 * The field asks for no meal (the owner, 11 November 2026). The page
 * files a log under the meal the clock says, and the sheet a diary row
 * opens moves it to another. A row of four meal pills headed the field
 * until Food11, and one meal chip with a menu stood in it for a day
 * after: of ten food apps' logging flows, none has a row of meals, and
 * the four whose diary is a time-ordered log, as this one is, ask for no
 * meal at all.
 *
 * The pencil alone turned out to be too quiet a way in: in the renders it
 * read as decoration. Mob2 (call 4) names it again, as a "Quick add" row
 * at the foot of the focused box's Log again list, where the form takes
 * calories with no name. The pencil stays as the shortcut beside the
 * text.
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
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBlur = () => {
    if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  useEffect(
    () => () => {
      if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    },
    []
  );
  /* In the field or with something written in it. */
  const typing = inputFocused || nlInput.trim() !== "";

  return (
    <div
      className="pb-2"
      onFocus={cancelBlur}
      onBlur={(event) => {
        // Tab moves through the send/scan controls to suggestion rows.
        // Keep the entire composer open while focus stays in that region.
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        cancelBlur();
        blurTimer.current = setTimeout(() => {
          setInputFocused(false);
          setSuggestionsActive(false);
          blurTimer.current = null;
        }, 200);
      }}
    >
      <div className="relative">
        {/* The field is the whole row; the dropdown sits below it at
            the row's full width, outside the field so it can never
            stretch a control in it. */}
        <div data-guide-anchor="food-composer">
          {/* One field holding the pencil, the text and the camera. Its
              box (the field primitive's edge, fill and radius) is drawn
              by a layer under the three, so each of them, the text box
              included, is the full height of the row. It is one row at
              every width: the pencil and the camera are 92px between
              them, which leaves the text 196px on a 320px phone. */}
          <div className="relative flex min-w-0 items-stretch">
            <div
              aria-hidden="true"
              data-field-box=""
              className="ds-input-box pointer-events-none absolute inset-0"
              style={{
                borderColor: inputFocused
                  ? "var(--ds-color-input-border-focus-nutrition)"
                  : undefined,
                boxShadow: inputFocused
                  ? "var(--ds-shadow-input-focus-nutrition)"
                  : undefined,
              }}
            />
            {/* The pencil is a manual-entry shortcut — a 44px button
                that leads the field. The named way to the same form is
                the Quick add row in the focused box's list (Mob2, call
                4); the dropdown's no-results row offers it as Log
                manually. It is there while the field is at rest and
                goes once the person is typing, when the text starts at
                the field's own 12px inset as in any text box. */}
            {!typing && (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  setSuggestionsActive(false);
                  onManualOpen();
                }}
                aria-label="Enter manually"
                className="relative z-[1] size-[44px] shrink-0 self-center inline-flex items-center justify-center rounded-lg text-muted-foreground active:scale-90 transition-all"
              >
                <PenLine className="size-4" />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              onFocus={() => {
                setSuggestionsActive(true);
                setInputFocused(true);
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
              /* min-h-[48px]: the row's height, the camera's at its
                 end. A floor, not a height, so a line of larger text on
                 the phone still fits; the pencil and the camera stay in
                 px, as iOS keeps a control's size when the text grows.
                 `field-sizing-content` grows the field a line when what
                 is typed wraps, up to max-h-40; where it is unsupported
                 the field stays one line. py-[14px] centres one 20px
                 line in the 48px row. `block`, because an inline
                 textarea sits on a text baseline and leaves a gap under
                 it.

                 The text box draws no box of its own: the layer under
                 it does, so the box takes in the pencil and the camera
                 too. The right edge clears the send button only while
                 there is text for it to send. The placeholder is one
                 line and ends in "…" if it does not fit: it changes
                 every few seconds, and a longer example that wrapped
                 would move the page each time. */
              className={cn(
                "relative z-[1] block min-h-[48px] max-h-40 min-w-0 flex-1 field-sizing-content resize-none border-0 bg-transparent py-[14px] text-sm text-foreground placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap",
                typing ? "pl-3" : "pl-0.5",
                nlInput.trim() ? "pr-11" : "pr-1"
              )}
              /* The global rule for a plain text box draws a focus ring
                 on it; this one's is the layer's. */
              style={{ outline: "none", boxShadow: "none" }}
            />
            {/* Send is there only while there is text to send. It sits
                at the end of the text, before the camera, so the camera
                never moves under a thumb. It is sized in px like the
                field's other controls: in rem it was 64px at twice the
                text size. Its 44px tap area stops where the camera's
                begins. */}
            {nlInput.trim() && (
              <div className="absolute right-[54px] top-1/2 z-[2] flex -translate-y-1/2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    onParse();
                  }}
                  disabled={nlParsing}
                  aria-label="Log meal"
                  className={cn(
                    "p-[6px] relative before:absolute before:-inset-[6px] before:content-[''] rounded-lg text-nutrition-strong transition-all active:scale-90",
                    nlParsing ? "opacity-50" : ""
                  )}
                >
                  <SendHorizontal className="size-[20px]" />
                </button>
              </div>
            )}
            {/* Scan: a camera at the end of the field, in the food
                orange, with a 48px tap area and no fill (Food11 call 3;
                the owner, 11 November 2026: as the food apps do it).
                Of five text fields with a scan control seen across four
                apps, three held it inside the field as an icon and none
                drew a filled button. It replaces the filled square
                beside the field of 23 September 2026, which had itself
                replaced a 20px icon that read as decoration; this one
                is 24px and keeps the colour. VoiceOver hears "Scan a
                meal". It is the only camera on the page.

                It stays put while there is text: the send button comes
                in before it.

                Every account gets the same control. A locked account
                (no photo scans on its tier) opens the scanner on
                Barcode, which is free, and the photo tabs there carry
                the Pro offer: the scanner reads `scanOverrides.locked`,
                not this button. The tap hands over the button's box,
                which the scanner grows out of. */}
            <IconButton
              variant="ghost"
              size="lg"
              aria-label="Scan a meal"
              icon={<Camera className="size-[24px]" />}
              onClick={(e) => {
                haptic();
                scanOverrides.onClick(e.currentTarget.getBoundingClientRect());
              }}
              className="relative z-[1] size-[48px] shrink-0 self-center text-nutrition-strong hover:bg-transparent"
            />
          </div>
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
