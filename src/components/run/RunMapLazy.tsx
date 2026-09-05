import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/Spinner";

const RunMap = lazyRetry(() => import("./RunMap"));

type RunMapProps = ComponentProps<typeof RunMap>;

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
    <Suspense
      fallback={
        <RunMapFallback height={props.height} className={props.className} />
      }
    >
      <RunMap {...props} />
    </Suspense>
  );
}
