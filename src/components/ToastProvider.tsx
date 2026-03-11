import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
          padding: "12px 20px",
          fontSize: "14px",
          color: "hsl(var(--foreground))",
        },
        className: "dark:!bg-gray-900/80 dark:!border-white/8",
      }}
      richColors
      closeButton
    />
  );
}
