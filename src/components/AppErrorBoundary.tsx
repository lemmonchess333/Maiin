import { Component, type ReactNode } from "react";
import { captureError } from "@/lib/errorReporting";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // PR G (audit P1 #14): route the crash through the structured
    // error-reporting helper instead of a raw console.error. Future
    // observability backends pick this up; production crashes stay
    // searchable / correlatable rather than scrolling past as
    // unstructured console noise.
    captureError(error, "component", {
      source: "react-error-boundary",
      componentStack: info.componentStack,
    });
    this.setState({ componentStack: info.componentStack || null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              {import.meta.env.DEV
                ? this.state.error?.message || "An unexpected error occurred."
                : "An unexpected error occurred. Please reload to continue."}
            </p>
            {import.meta.env.DEV && this.state.error?.stack && (
              <details className="text-left rounded-lg border border-border bg-muted/40 p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Stack trace
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto text-[10px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.error.stack}
                  {this.state.componentStack
                    ? `\n\nComponent stack:${this.state.componentStack}`
                    : ""}
                </pre>
              </details>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, componentStack: null });
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.setItem("fitcircle_chunk_retry", "1");
                    const u = new URL(window.location.href);
                    u.searchParams.set("_cb", String(Date.now()));
                    if ("caches" in window) {
                      caches
                        .keys()
                        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
                        .finally(() => window.location.replace(u.toString()));
                    } else {
                      window.location.replace(u.toString());
                    }
                  } catch {
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, componentStack: null });
                  window.location.hash = "#/home";
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
