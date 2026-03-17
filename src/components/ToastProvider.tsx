import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: "#F5F3F0",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          borderLeft: "3px solid #7c3aed",
          borderRadius: "16px",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
          padding: "12px 20px",
          fontSize: "14px",
          color: "hsl(var(--foreground))",
        },
        className: "dark:!bg-gray-900/80 dark:!border-white/8",
      }}
      closeButton
    />
  );
}
