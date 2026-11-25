import { Component, type ReactNode } from "react";
import { captureError } from "@/lib/errorReporting";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("App error caught by boundary:", error, errorInfo);
    }
    captureError(error, { componentStack: errorInfo.componentStack ?? undefined });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="max-w-md w-full bg-[var(--bg-card)] rounded-2xl p-6 shadow-md border border-[var(--border-subtle)] text-center space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              An unexpected error occurred. Your workout and nutrition data is safely stored.
            </p>
            {this.state.error && (
              <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-primary)] p-3 rounded-lg font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="px-6 py-2.5 bg-[var(--accent-primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
