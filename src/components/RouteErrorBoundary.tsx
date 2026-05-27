import { Component, type ReactNode } from "react";
import { THEME } from "../lib/theme";
import { captureError } from "@/lib/errorReporting";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Route the crash to the error-reporting pipeline so we capture
    // it in the structured log rather than a raw console.error that
    // users can see in DevTools. Dev mode still surfaces the full
    // componentStack via the built-in React overlay.
    captureError(error, "component", { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      // Raw error.message can leak implementation detail ("Firestore:
      // Missing or insufficient permissions", SDK internal paths).
      // Keep it visible in dev for debugging, collapse to a generic
      // "Please try again" in production.
      const isDev = import.meta.env.DEV;
      const errorText = isDev
        ? this.state.error?.message ||
          "An unexpected error occurred on this page."
        : "Please try again. If the problem keeps happening, restart Tropos.";
      return (
        <div
          className="flex-1 flex items-center justify-center px-6 py-12"
          role="alert"
        >
          <div className="text-center space-y-4 max-w-sm w-full">
            <div
              className="size-14 mx-auto rounded-full flex items-center justify-center"
              style={{ background: `${THEME.danger}15` }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={THEME.danger}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground">{errorText}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-card text-foreground"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = import.meta.env.BASE_URL;
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: THEME.teal }}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
