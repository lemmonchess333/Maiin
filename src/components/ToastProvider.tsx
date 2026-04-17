import { Toaster } from "sonner";
import { THEME } from "@/lib/theme";

export function ToastProvider() {
  return (
    <>
      <style>{`
        [data-sonner-toast] [data-close-button] {
          color: #9ca3af !important;
          left: auto !important;
          right: 8px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          background: transparent !important;
          border: 0 !important;
        }
        [data-sonner-toast] [data-icon] svg {
          color: ${THEME.brand} !important;
        }
        [data-sonner-toast][data-type="success"] [data-icon] svg {
          color: ${THEME.success} !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] svg {
          color: ${THEME.danger} !important;
        }
        /* Light mode toast */
        [data-sonner-toast] {
          background: #F5F3F0 !important;
          border: 1px solid rgba(0, 0, 0, 0.08) !important;
          border-left: 3px solid ${THEME.brand} !important;
          color: #1a1a2e !important;
          padding-right: 32px !important;
        }
        /* Dark mode toast */
        .dark [data-sonner-toast],
        [data-theme="dark"] [data-sonner-toast] {
          background: ${THEME.surface} !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-left: 3px solid ${THEME.brand} !important;
          color: ${THEME.textPrimary} !important;
        }
      `}</style>
      <Toaster
        position="top-center"
        offset="env(safe-area-inset-top, 54px)"
        aria-live="polite"
        toastOptions={{
          style: {
            borderRadius: "16px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
            padding: "12px 20px",
            fontSize: "14px",
          },
        }}
        closeButton
      />
    </>
  );
}
