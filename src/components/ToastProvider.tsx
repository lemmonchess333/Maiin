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
        position="top-center"
        offset="env(safe-area-inset-top, 54px)"
        aria-live="polite"
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
