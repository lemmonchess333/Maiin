import { useSyncExternalStore } from "react";
import { bootSteps, subscribeBootTrace } from "@/lib/bootTrace";

/** What the app has done since it started, newest last (bootTrace.ts). */
export default function BootSteps() {
  const steps = useSyncExternalStore(subscribeBootTrace, bootSteps, bootSteps);
  return (
    <ol
      aria-label="What Tropos has done so far"
      className="space-y-1 rounded-xl bg-muted p-3 text-left font-mono text-micro leading-snug text-muted-foreground break-words"
    >
      {steps.map((entry, index) => (
        <li key={index}>
          {(entry.at / 1000).toFixed(1)} s · {entry.step}
        </li>
      ))}
    </ol>
  );
}
