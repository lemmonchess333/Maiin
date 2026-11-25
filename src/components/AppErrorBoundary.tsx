import { Component, type ReactNode } from "react";
import { captureError } from "@/lib/errorReporting";
import { Button } from "@/components/ui/Button";
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
      // Sprint 5: hide raw error message + component stack from
      // users in production. Showing "Cannot read properties of
      // undefined (reading 'foo')" to a TestFlight user reads as
      // a crashed app, not a designed error state. The technical
      // details remain visible in dev so debugging stays fast, and
      // the full error continues to log via console.error in
      // componentDidCatch above (line 102) for operator triage.
      const isDev = import.meta.env.DEV;
      return (
        <div
          className="min-h-screen bg-background flex items-center justify-center px-6"
          role="alert"
        >
          <div className="text-center space-y-4 max-w-sm w-full">
            <p className="text-4xl" aria-hidden="true">
              Warning
            </p>
            <h1 className="text-lg font-bold text-foreground">
              Something went wrong
            </h1>

            <p className="text-sm text-muted-foreground break-words">
              {isDev
                ? this.state.error?.message || "An unexpected error occurred."
                : "Try refreshing the app. If it keeps happening, contact support."}
            </p>

            {isDev && this.state.componentStack && (
              <details className="text-left bg-card border border-border/50 rounded-xl p-3">
                <summary className="text-sm font-medium text-foreground cursor-pointer">
                  Show component trace (dev only)
                </summary>
                <pre className="mt-2 text-xs leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.componentStack}
                </pre>
              </details>
            )}

            <Button
              type="button"
              onClick={async () => {
                // Purge the stale-chunk recovery latch so lazyRetry can
                // reload-and-retry again on the next failure. Previously
                // the latch was session-scoped, which meant a user who
                // hit ONE module-import error (typically post-deploy)
                // exhausted their one-shot retry and then saw this
                // error boundary on every subsequent navigation until
                // they killed the PWA.
                try {
                  sessionStorage.removeItem("chunk-retry");
                } catch {
                  // Private mode / storage disabled — fine, the flag
                  // was unreachable anyway.
                }
                if ("caches" in window) {
                  try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                  } catch {
                    // CacheStorage unavailable — ignore and proceed to reload.
                  }
                }
                const url = new URL(window.location.href);
                url.searchParams.set("_cb", String(Date.now()));
                window.location.replace(url.toString());
              }}
              className="w-full px-6 py-3 rounded-xl bg-primary-strong text-primary-foreground font-medium text-sm"
            >
              Reload App
            </Button>

            <Button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null, componentStack: null });
                window.location.assign(import.meta.env.BASE_URL);
              }}
              className="w-full px-6 py-3 rounded-xl border border-border/50 text-foreground font-medium text-sm"
            >
              Go home
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
