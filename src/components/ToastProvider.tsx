import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <>
      <style>{`
        /* Modern toast — clean card surface, no cream-accent throwback.
           Uses the same tokens as the rest of the app's cards so the
           toast reads as part of the design system, not a third-party
           overlay. */
        [data-sonner-toast] {
          background: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
          border-radius: 14px !important;
          padding: 12px 16px !important;
          box-shadow: var(--ds-shadow-elevated) !important;
        }
        [data-sonner-toast] [data-close-button] {
          color: hsl(var(--muted-foreground)) !important;
          background: transparent !important;
          border: 0 !important;
          left: auto !important;
          right: 8px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        /* Status icons keep their semantic colour. */
        [data-sonner-toast][data-type="success"] [data-icon] svg {
          color: var(--ds-success) !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] svg {
          color: var(--ds-error) !important;
        }
        /* Title/description hierarchy — sonner's flat default made the
           whole toast read as one undifferentiated line. */
        [data-sonner-toast] [data-title] {
          font-weight: 600 !important;
        }
        [data-sonner-toast] [data-description] {
          color: hsl(var(--muted-foreground)) !important;
        }
        /* Action button — sonner's default is an unstyled near-black pill
           that reads as a third-party artefact (the "Refresh" button on the
           update toast). Restyle to the app's primary CTA language:
           brand-strong fill (the AA text-on-colour step), pill radius,
           semibold. 36px matches the Button primitive's sm size (the
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
        offset="calc(env(safe-area-inset-bottom, 0px) + 80px)"
        // CRITICAL: sonner only applies `offset` on viewports ≥600px; phones
        // use `mobileOffset`, which DEFAULTS TO 16px. Without this mirror,
        // every toast on a phone rendered on top of the bottom tab bar and
        // intercepted its taps — an infinite-duration toast (the old SW
        // update prompt) made the whole nav permanently untappable on iOS.
        mobileOffset="calc(env(safe-area-inset-bottom, 0px) + 80px)"
        aria-live="polite"
        // 1500ms matches the convention across the apps audited; Sonner's
        // 4000ms default reads as slow/lingering on a fitness surface
        // where users add multiple items in quick succession.
        duration={1500}
        // Cap at 2 visible — beyond that the stack starts to obscure the
        // app behind it and feels chatty.
        visibleToasts={2}
        toastOptions={{
          style: {
            fontSize: "14px",
          },
        }}
        closeButton
      />
    </>
  );
}
