import { useEffect, useRef, useSyncExternalStore } from "react";
import { bootSteps, subscribeBootTrace } from "@/lib/bootTrace";
import { cn } from "@/lib/utils";

/**
 * What the app has done since it started, newest last (bootTrace.ts). The
 * list keeps to a box and scrolls to its newest step, so forty rows never
 * push what sits under it (a Retake, a Try again) off the screen and the
 * step that never finished is the one in view. `onDark` is for a black
 * overlay, the scanner's.
 */
export default function BootSteps({ onDark = false }: { onDark?: boolean }) {
  const steps = useSyncExternalStore(subscribeBootTrace, bootSteps, bootSteps);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [steps]);
  return (
    <ol
      ref={listRef}
      aria-label="What Tropos has done so far"
      className={cn(
        "max-h-48 space-y-1 overflow-y-auto rounded-xl p-3 text-left font-mono text-micro leading-snug break-words",
        onDark ? "bg-white/10 text-white/80" : "bg-muted text-muted-foreground"
      )}
    >
      {steps.map((entry, index) => (
        <li key={index}>
          {(entry.at / 1000).toFixed(1)} s · {entry.step}
        </li>
      ))}
    </ol>
  );
}
