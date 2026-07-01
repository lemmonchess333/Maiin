import { MapPin, X } from "lucide-react";
import { THEME } from "../../lib/theme";

/**
 * Non-blocking "While Using only" note for native runs (Step 2,
 * docs/run-background-gps.md Section 7).
 *
 * Surfaced when we infer the user granted only "While Using" location — the
 * OS pauses tracking while the app is backgrounded / screen-locked (see
 * `shouldWarnBackgroundPause`). The run is NOT blocked: tracking continues
 * foregrounded exactly as web behaves today; this only points the user at
 * Settings to upgrade to "Always" for uninterrupted tracking.
 *
 * Lives on the always-dark full-screen run overlay, so it follows the local
 * bespoke-inline-style idiom (like the acquiring screen / gap banners) rather
 * than the theme-aware Button primitive. Both controls clear the 44px floor.
 *
 * NOT self-positioned: it renders inside Run.tsx's single top-centre banner
 * stack (the 2026-08-12 device-QA fix that removed per-banner `top-*`
 * offsets), so it inherits the stack's anchoring and never collides with
 * the auto-pause / gap pills.
 */
export default function RunBackgroundGrantNote({
  onOpenSettings,
  onDismiss,
}: {
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="w-[min(92vw,340px)] max-w-full rounded-2xl px-4 py-3"
      style={{
        background: "rgba(0,0,0,0.72)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: "rgba(212,99,122,0.18)" }}
        >
          <MapPin
            className="size-4"
            style={{ color: THEME.running }}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            Tracking pauses when locked
          </p>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Run tracking will pause when your screen locks. For uninterrupted
            tracking: Settings → Tropos → Location → Always.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-2 inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold active:scale-[0.97]"
            style={{ background: THEME.running, color: "#fff" }}
          >
            Open Settings
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss location note"
          className="flex size-11 flex-shrink-0 items-center justify-center rounded-lg active:scale-[0.97]"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
