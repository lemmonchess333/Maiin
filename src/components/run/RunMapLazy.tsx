import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';

const RunMap = lazy(() => import('./RunMap'));

type RunMapProps = ComponentProps<typeof RunMap>;

function RunMapFallback({ height = 'h-full', className = '' }: { height?: string; className?: string }) {
  return (
    <div className={`w-full ${height} ${className} bg-black/20 animate-pulse flex items-center justify-center`}>
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

export default function RunMapLazy(props: RunMapProps) {
  return (
    <Suspense fallback={<RunMapFallback height={props.height} className={props.className} />}>
      <RunMap {...props} />
    </Suspense>
  );
}
