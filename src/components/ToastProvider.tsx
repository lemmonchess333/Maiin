import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <>
      <style>{`
        [data-sonner-toast] [data-close-button] {
          color: #9ca3af !important;
        }
        [data-sonner-toast] [data-icon] svg {
          color: #7c3aed !important;
        }
        [data-sonner-toast][data-type="success"] [data-icon] svg {
          color: #22c55e !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] svg {
          color: #ef4444 !important;
        }
      `}</style>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#F5F3F0",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            borderLeft: "3px solid #7c3aed",
            borderRadius: "16px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
            padding: "12px 20px",
            fontSize: "14px",
            color: "#1a1a2e",
          },
          className: "dark:!bg-gray-900/80 dark:!border-white/8",
        }}
        closeButton
      />
    </>
  );
}
