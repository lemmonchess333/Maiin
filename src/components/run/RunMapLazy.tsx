import { Component, Suspense, type ReactNode } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/Spinner";

// Do not reload an active run to recover an optional map chunk.
const RunMap = lazyRetry(() => import("./RunMap"), {
  reloadOnChunkError: false,
});

type RunMapProps = ComponentProps<typeof RunMap>;

// Maps are optional presentation. A failed WebGL constructor (including in a
// passive effect) or lazy import must not unmount the parent run recorder.
class MapBoundary extends Component<
  {
    children: ReactNode;
    height?: string;
    className?: string;
    liveControls?: boolean;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="status"
        className={`flex w-full items-center justify-center bg-muted p-6 text-center ${this.props.height ?? "h-full"} ${this.props.className ?? ""}`}
      >
        <div className="max-w-xs space-y-2">
          <p className="font-semibold text-foreground">Map unavailable</p>
          <p className="text-sm text-muted-foreground">
            {this.props.liveControls
              ? "Run controls are still available. Location tracking depends on GPS permission and signal."
              : "Your saved run details are still available."}
          </p>
        </div>
      </div>
    );
  }
}

function RunMapFallback({
  height = "h-full",
  className = "",
}: {
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`w-full ${height} ${className} bg-black/20 motion-safe:animate-pulse flex items-center justify-center`}
    >
      <Spinner size="md" variant="inverse" label="Loading map" />
    </div>
  );
}

export default function RunMapLazy(props: RunMapProps) {
  return (
    <MapBoundary
      height={props.height}
      className={props.className}
      liveControls={props.liveControls}
    >
      <Suspense
        fallback={
          <RunMapFallback height={props.height} className={props.className} />
        }
      >
        <RunMap {...props} />
      </Suspense>
    </MapBoundary>
  );
}
