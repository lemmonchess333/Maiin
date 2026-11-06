import { useEffect, useState, useSyncExternalStore } from "react";
import {
  RUNNING_PRESCRIPTION_GATE_ENABLED,
  INACTIVE_RUNNING_ACCESS,
  UNAVAILABLE_RUNNING_ACCESS,
  type RunningGateContext,
} from "./runningPrescriptionGate";

type Controller =
  (typeof import("./runningPrescriptionGateRuntime"))["runningPrescriptionGate"];
const subscribeUnavailable = () => () => {};
const unavailableVersion = () => 0;

function online() {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/** Shared by both programme readers and the run entrypoint. Identity is
 * compared during render, not only after the previous request's cleanup. */
function useEnabledRunningPrescriptionGate(
  user: { uid: string } | null | undefined
) {
  const [controller, setController] = useState<Controller | null>(null);
  useSyncExternalStore(
    controller?.subscribe ?? subscribeUnavailable,
    controller?.version ?? unavailableVersion,
    controller?.version ?? unavailableVersion
  );
  useEffect(() => {
    let cancelled = false;
    // Keep the negotiation state machine out of the inactive reader graph.
    // Loading and failed imports both retain the synchronous deny state.
    void import("./runningPrescriptionGateRuntime").then(
      ({ runningPrescriptionGate }) => {
        if (!cancelled) setController(runningPrescriptionGate);
      },
      () => {} // A missing/stale chunk must never authorize legacy data.
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const context: RunningGateContext = {
    accountId: user?.uid ?? null,
    session: user ?? null,
    online: online(),
  };
  useEffect(() => {
    if (!controller) return;
    const sync = () =>
      controller.setContext({
        accountId: user?.uid ?? null,
        session: user ?? null,
        online: online(),
      });
    const foreground = () => {
      if (document.visibilityState === "visible") void controller.refresh();
      else controller.invalidate();
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", foreground);
    // Expiry never gives permission to legacy data. A timer just makes status
    // consumers repaint even when nothing else in the app is moving.
    const timer = window.setInterval(() => void controller.refresh(), 60_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", foreground);
      window.clearInterval(timer);
    };
  }, [user, controller]);
  return controller?.read(context) ?? UNAVAILABLE_RUNNING_ACCESS;
}

// This is a source-time choice, never a runtime feature toggle. Selecting the
// hook here removes dormant effects and imports from the inactive build while
// preserving a fixed hook order for every mounted consumer.
function useInactiveRunningPrescriptionGate() {
  return INACTIVE_RUNNING_ACCESS;
}
export const useRunningPrescriptionGate = RUNNING_PRESCRIPTION_GATE_ENABLED
  ? useEnabledRunningPrescriptionGate
  : useInactiveRunningPrescriptionGate;
