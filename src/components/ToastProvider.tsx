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
      `}</style>
      <Toaster
        // Bottom-anchored matches every modern fitness app (MyFitnessPal,
        // Cal AI, Whoop, Apple Fitness). Top-center blocked the dynamic
        // island and required eye travel away from the action site.
        // Offset clears the bottom tab bar (~64px) plus a small gap so
        // the toast doesn't visually merge with it.
        position="bottom-center"
        offset="calc(env(safe-area-inset-bottom, 0px) + 80px)"
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
