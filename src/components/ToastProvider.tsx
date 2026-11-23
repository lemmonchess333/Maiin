import { Toaster } from "sonner";
import { TOAST_DURATION_MS } from "@/lib/toastDurations";

/** Clears the bottom tab bar (~64px) plus a small gap, so a toast never
 *  sits on the bar or takes its taps. */
const ABOVE_TAB_BAR = "calc(env(safe-area-inset-bottom, 0px) + 80px)";

export function ToastProvider() {
  return (
    <>
      <style>{`
        /* A toast floats over the page and goes, so it is glass (DS6
           step 4, DESIGN_GUIDE §14o): the card's colour over a static blur
           of what is behind it. The fill keeps enough of the card that the
           grey line holds AA with no blur at all, over the worst thing
           that can pass behind, with a margin: 94% on light over black
           (4.77:1; at 92% it was 4.56:1, at 90% 4.35:1) and 90% on dark
           over white (5.28:1; at 85% it was 4.42:1), the fills the
           workout's docked cards use. On
           dark the edge is the card's lit edge, a hairline of light along
           the top and a faint outline, in place of the grey border. The
           blur is written out, never through a variable (WebKit ignores
           one in -webkit-backdrop-filter), and sonner moves the toast
           itself, so no fading ancestor cuts the blur off. */
        [data-sonner-toast] {
          background: hsl(var(--card) / 0.94) !important;
          border: 1px solid hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
          border-radius: 14px !important;
          padding: 12px 16px !important;
          box-shadow: var(--ds-shadow-elevated) !important;
          -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
          backdrop-filter: blur(24px) saturate(1.3) !important;
        }
        .dark [data-sonner-toast] {
          background: hsl(var(--card) / 0.9) !important;
          border-color: transparent !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.14),
            inset 0 0 0 1px rgba(255, 255, 255, 0.08),
            var(--ds-shadow-elevated) !important;
        }
        /* Solid where the blur cannot be drawn, and under Reduce
           Transparency: the media query where a browser has it, the
           attribute the app sets from the phone's own setting where it
           does not (WebKit; #3398's reducedTransparency module sets it). */
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          [data-sonner-toast],
          .dark [data-sonner-toast] {
            background: hsl(var(--card)) !important;
          }
        }
        @media (prefers-reduced-transparency: reduce) {
          [data-sonner-toast],
          .dark [data-sonner-toast] {
            background: hsl(var(--card)) !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
          }
        }
        :root[data-reduced-transparency] [data-sonner-toast] {
          background: hsl(var(--card)) !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        /* A toast with BOTH an action and a cancel ("Retry" + "Log
           manually" on the Food page’s failed-search toast) at phone width:
           the pills are flex-shrink:0 below, so the title collapsed to its
           min-content — one character per line ("C o u l d n ' t …",
           reproduced at 393px). Let the row wrap so the
           buttons drop beneath the title, and give the content a real share
           of the width; a single short action still fits beside the title. */
        [data-sonner-toast] {
          flex-wrap: wrap !important;
        }
        [data-sonner-toast] [data-content] {
          flex: 1 1 60% !important;
          min-width: 0;
        }
        /* The close button has a gutter of its own at the right edge.
           Centred there with nothing reserved, it sat on the action
           button: the × covered the right of "Undo" on a deleted meal and
           of "Retry" on the failed food search, so a tap there closed the
           toast instead. It is the 44px target every control gets, with
           its small glyph centred in it. */
        [data-sonner-toast] {
          padding-right: 48px !important;
        }
        [data-sonner-toast] [data-close-button] {
          color: hsl(var(--muted-foreground)) !important;
          background: transparent !important;
          border: 0 !important;
          left: auto !important;
          right: 2px !important;
          top: 50% !important;
          width: 44px !important;
          height: 44px !important;
          transform: translateY(-50%) !important;
        }
        /* Status icons keep their semantic colour. */
        [data-sonner-toast][data-type="success"] [data-icon] svg {
          color: var(--ds-success) !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] svg {
          color: var(--ds-error) !important;
        }
        /* Title/description hierarchy — sonner’s flat default made the
           whole toast read as one undifferentiated line. */
        [data-sonner-toast] [data-title] {
          font-weight: 600 !important;
        }
        [data-sonner-toast] [data-description] {
          color: hsl(var(--muted-foreground)) !important;
        }
        /* Action button — sonner’s default is an unstyled near-black pill
           that reads as a third-party artefact (the "Refresh" button on the
           update toast). Restyle to the app’s filled button: the text
           colour filled with the page's colour on it, pill radius,
           semibold. 36px matches the Button primitive’s sm size (the
           sanctioned inline-control height). */
        [data-sonner-toast] [data-button] {
          background: hsl(var(--primary-strong)) !important;
          color: hsl(var(--primary-foreground)) !important;
          border-radius: 999px !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          height: 36px !important;
          min-height: 36px !important;
          padding: 0 14px !important;
          flex-shrink: 0;
        }
        /* Cancel stays low-emphasis (ghost) next to the filled action. */
        [data-sonner-toast] [data-button][data-cancel] {
          background: hsl(var(--muted)) !important;
          color: hsl(var(--foreground)) !important;
        }
      `}</style>
      <Toaster
        // Bottom-anchored matches every modern fitness app (MyFitnessPal,
        // Cal AI, Whoop, Apple Fitness). Top-center blocked the dynamic
        // island and required eye travel away from the action site.
        // Offset clears the bottom tab bar (~64px) plus a small gap so
        // the toast doesn't visually merge with it.
        position="bottom-center"
        // The bottom only. sonner reads a single value as all four sides,
        // so the 80px meant to clear the tab bar was also each side's
        // margin: on a 393px phone every toast was 233px wide, its title
        // wrapping and its action pushed onto a line of its own. The sides
        // keep sonner's own margins (16px on a phone, 24px wider).
        offset={{ bottom: ABOVE_TAB_BAR }}
        // CRITICAL: sonner only applies `offset` on viewports ≥600px; phones
        // use `mobileOffset`, which DEFAULTS TO 16px. Without this mirror,
        // every toast on a phone rendered on top of the bottom tab bar and
        // intercepted its taps — an infinite-duration toast (the old SW
        // update prompt) made the whole nav permanently untappable on iOS.
        mobileOffset={{ bottom: ABOVE_TAB_BAR }}
        aria-live="polite"
        // The shortest life a toast gets. Errors and toasts with an action
        // stay longer, set per toast by `@/lib/toast` (sonner has no
        // duration by kind); this covers what does not go through it, a
        // promise's or a custom toast.
        duration={TOAST_DURATION_MS.default}
        // Cap at 2 visible — beyond that the stack starts to obscure the
        // app behind it and feels chatty.
        visibleToasts={2}
        toastOptions={{
          style: {
            fontSize: "0.875rem",
          },
        }}
        closeButton
      />
    </>
  );
}
