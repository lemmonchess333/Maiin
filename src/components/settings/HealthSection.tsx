import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Footprints } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { Toggle } from "@/components/ui/Toggle";
import { Skeleton } from "@/components/LoadingSkeleton";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { useUid } from "@/lib/auth";
import { useSteps } from "@/hooks/useSteps";
import { useConnectedTrainingPrefs } from "@/hooks/useConnectedTrainingPrefs";
import { CONNECTED_TRAINING_RELEASED } from "@/lib/connectedTrainingRelease";
import {
  isWatchRunLocallyDisabled,
  isWorkoutExportLocallyDisabled,
  setWatchRunLocallyDisabled,
  setWorkoutExportLocallyDisabled,
} from "@/lib/connectedTrainingPrefs";
import {
  getWorkoutWriteAuthorization,
  isWorkoutWriteAvailable,
  openHealthSettings,
  requestWorkoutWritePermission,
} from "@/lib/healthKit";
import {
  getWatchRunStatus,
  setWatchRunEnabled,
  subscribeWatchRunConnection,
  type WatchRunStatus,
} from "@/lib/watchRunBridge";
import { isNativePlatform } from "@/lib/platform";

const ROW =
  "flex flex-wrap items-center gap-x-3 gap-y-2 p-4 rounded-lg bg-muted";
const LABEL = "min-w-[min(100%,8em)] flex-1";

/** Apple Health choices remain independent: steps, Watch HR, and export.
 *  A build without connected training (every standard build) shows steps
 *  alone, plus any Apple Health cleanup a pilot build left waiting. */
export default function HealthSection({
  inline = false,
}: {
  inline?: boolean;
}) {
  const uid = useUid();
  const { status, steps, connect, pending } = useSteps();
  const connected = status === "connected" || status === "ambiguous";
  const { prefs, loading, failed, update, retry } = useConnectedTrainingPrefs();
  const watchLocallyDisabled = isWatchRunLocallyDisabled(uid ?? "");
  const [watch, setWatch] = useState<WatchRunStatus | null>(null);
  const [writeAvailable, setWriteAvailable] = useState<boolean | null>(null);
  const [writeAuthorization, setWriteAuthorization] = useState<
    "authorized" | "denied" | "notDetermined" | "unavailable" | null
  >(null);
  const [pendingExports, setPendingExports] = useState(0);
  const [busy, setBusy] = useState<"watch" | "export" | null>(null);
  const syncAttempted = useRef<string | null>(null);
  const currentUid = useRef(uid);
  useLayoutEffect(() => {
    currentUid.current = uid;
  }, [uid]);

  const refresh = useCallback(async () => {
    const [watchStatus, exportAvailable, authorization] = await Promise.all([
      getWatchRunStatus(),
      isWorkoutWriteAvailable(),
      getWorkoutWriteAuthorization(),
    ]);
    if (currentUid.current !== uid) return;
    setWatch(watchStatus);
    setWriteAvailable(exportAvailable);
    setWriteAuthorization(authorization);
    // Cleanup remains visible if a later release disables new Watch exports.
    if (uid && isNativePlatform()) {
      const { pendingHealthWorkoutExports } =
        await import("@/lib/healthWorkoutExport");
      if (currentUid.current !== uid) return;
      setPendingExports(pendingHealthWorkoutExports(uid).length);
    } else {
      setPendingExports(0);
    }
  }, [uid]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh reads native capability asynchronously
    void refresh();
    void subscribeWatchRunConnection((next) => {
      if (active) setWatch(next);
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // The account's consent and this phone's native switch must agree. A failed
  // account read fails closed, and each account/choice is applied only once.
  useEffect(() => {
    if (loading || !watch?.available || busy) return;
    const shouldEnable =
      CONNECTED_TRAINING_RELEASED &&
      !!uid &&
      !failed &&
      prefs.useWatchForRuns &&
      !watchLocallyDisabled;
    const key = `${uid ?? "signed-out"}:${shouldEnable}`;
    if (watch.enabled === shouldEnable || syncAttempted.current === key) return;
    syncAttempted.current = key;
    void setWatchRunEnabled(shouldEnable).then(() => refresh());
  }, [
    busy,
    failed,
    loading,
    prefs.useWatchForRuns,
    refresh,
    uid,
    watch,
    watchLocallyDisabled,
  ]);

  const watchReady = Boolean(
    CONNECTED_TRAINING_RELEASED &&
    watch?.available &&
    watch.paired &&
    watch.installed
  );
  const watchEnabled = Boolean(
    CONNECTED_TRAINING_RELEASED &&
    prefs.useWatchForRuns &&
    watch?.enabled &&
    !watchLocallyDisabled
  );
  const watchStatusText = !watch
    ? "Connecting"
    : !watch.available
      ? "Not available here"
      : !watch.paired
        ? "No paired Apple Watch"
        : !watch.installed
          ? "Watch app not installed"
          : !watchEnabled
            ? "Off"
            : !watch.reachable
              ? "Connection lost"
              : watch.activeSessionId
                ? "Active run"
                : "Ready";
  const showPendingExports = isNativePlatform() && pendingExports > 0;

  const handleWatchToggle = async () => {
    if (
      !CONNECTED_TRAINING_RELEASED ||
      !uid ||
      busy ||
      loading ||
      failed ||
      !watch
    )
      return;
    const next = !watchEnabled;
    if (next && !watchReady) return;
    haptic("light");
    setBusy("watch");
    try {
      if (next) {
        // Keep the old off choice through a failed or interrupted enable.
        // Only a fully saved, native-enabled explicit tap retires the veto.
        if (!setWatchRunLocallyDisabled(uid, true)) {
          toast.error(
            "Couldn't remember your Watch choice. Free device storage and try again."
          );
          return;
        }
        if (!(await update("useWatchForRuns", true))) {
          toast.error("Couldn't save your Watch setting. Try again.");
          return;
        }
        if (!(await setWatchRunEnabled(true))) {
          syncAttempted.current = `${uid}:true`;
          await update("useWatchForRuns", false);
          toast.error("Couldn't connect your Watch. Try again.");
          return;
        }
        if (!setWatchRunLocallyDisabled(uid, false)) {
          await setWatchRunEnabled(false);
          toast.error("Couldn't remember your Watch choice. Try again.");
          return;
        }
      } else {
        // Persist the device-level veto before changing native state. A
        // failed account write must never silently turn this Watch back on.
        if (!setWatchRunLocallyDisabled(uid, true)) {
          toast.error(
            "Couldn't remember your Watch choice. Free device storage and try again."
          );
          return;
        }
        if (!(await setWatchRunEnabled(false))) {
          toast.error("Couldn't turn off Watch runs. Try again.");
          return;
        }
        if (!(await update("useWatchForRuns", false))) {
          toast.error(
            "Watch runs are off here, but the setting could not sync."
          );
        }
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleExportToggle = async () => {
    if (
      !CONNECTED_TRAINING_RELEASED ||
      busy ||
      loading ||
      failed ||
      !writeAvailable
    )
      return;
    const exportEnabled =
      prefs.saveWorkoutsToHealth &&
      !!uid &&
      !isWorkoutExportLocallyDisabled(uid);
    const next = !exportEnabled;
    haptic("light");
    setBusy("export");
    try {
      if (next && !(await requestWorkoutWritePermission())) {
        toast.error("Allow Tropos to add workouts in Apple Health settings.");
        return;
      }
      if (!next && uid) setWorkoutExportLocallyDisabled(uid, true);
      if (!(await update("saveWorkoutsToHealth", next))) {
        toast.error("Couldn't save your Apple Health choice. Try again.");
        return;
      }
      if (next && uid && !setWorkoutExportLocallyDisabled(uid, false)) {
        toast.error(
          "Your choice saved, but workout export needs a retry here."
        );
      }
      if (uid && isNativePlatform()) {
        const { reconcilePendingHealthExports } =
          await import("@/lib/healthWorkoutExport");
        await reconcilePendingHealthExports(uid);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const retryExports = async () => {
    if (!uid || busy) return;
    haptic("light");
    setBusy("export");
    try {
      const { reconcilePendingHealthExports } =
        await import("@/lib/healthWorkoutExport");
      await reconcilePendingHealthExports(uid);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AccordionSection
      inline={inline}
      icon={<Footprints className="size-5 text-primary" />}
      title="Apple Health"
      subtitle={
        CONNECTED_TRAINING_RELEASED
          ? "Steps, Watch runs, workout export"
          : "Daily step count on Home"
      }
    >
      <div className="space-y-3">
        <SectionHeading size="compact">Steps</SectionHeading>
        {pending && <Skeleton className="h-[4.5rem] w-full rounded-lg" />}
        {!pending && status === "unavailable" && (
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-foreground">Not available here</p>
            <p className="text-xs text-muted-foreground">
              Step tracking uses Apple Health, available in the Tropos iOS app.
            </p>
          </div>
        )}
        {!pending && status === "unprompted" && (
          <div className={ROW}>
            <div className={LABEL}>
              <p className="text-sm text-foreground">Connect Apple Health</p>
              <p className="text-xs text-muted-foreground">
                Show your daily step count on Home.
              </p>
            </div>
            <Button
              variant="primary"
              className="ml-auto"
              onClick={() => {
                haptic("light");
                void connect();
              }}
            >
              Connect
            </Button>
          </div>
        )}
        {!pending && connected && (
          <div className={ROW}>
            <div className={LABEL}>
              <p className="text-sm text-foreground">Apple Health connected</p>
              <p className="text-xs text-muted-foreground">
                Steps refresh when you open Tropos.
              </p>
            </div>
            <span className="ml-auto text-sm font-mono tabular-nums font-semibold text-foreground">
              {(steps ?? 0).toLocaleString()}
            </span>
          </div>
        )}
        {!pending && status === "ambiguous" && (
          <div
            role="alert"
            className="flex items-start gap-3 p-3 rounded-lg border border-warning/15 bg-warning-bg"
          >
            <AlertTriangle className="size-4 mt-[2px] shrink-0 text-warning-strong" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No steps yet
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                If your steps stay at zero, allow Tropos to read steps in
                Settings → Health → Data Access &amp; Devices → Tropos.
              </p>
              <Button variant="ghost" onClick={() => void openHealthSettings()}>
                Open settings
              </Button>
            </div>
          </div>
        )}
      </div>

      {CONNECTED_TRAINING_RELEASED && (
        <div className="space-y-3">
          <SectionHeading size="compact">Apple Watch runs</SectionHeading>
          <div className={ROW}>
            <div className={LABEL}>
              <p className="text-sm text-foreground">Use Watch for runs</p>
              <p className="text-xs text-muted-foreground">
                The iPhone records your run. The Watch shows pace, distance and
                heart rate, and can control a connected run.
              </p>
              <p className="text-xs font-medium text-foreground mt-1">
                {watchStatusText}
              </p>
            </div>
            <Toggle
              className="ml-auto"
              checked={watchEnabled}
              label="Use Watch for runs"
              disabled={
                loading ||
                failed ||
                !!busy ||
                !uid ||
                !watch ||
                (!watchEnabled && !watchReady)
              }
              onChange={() => void handleWatchToggle()}
            />
          </div>
          {watch && !watch.available && (
            <p className="text-xs text-muted-foreground px-1">
              {isNativePlatform()
                ? "Apple Watch runs need a supported Tropos iPhone app and a paired Watch."
                : "Apple Watch runs are available in the Tropos iPhone app."}
            </p>
          )}
          {watch?.available && !watch.paired && (
            <p className="text-xs text-muted-foreground px-1">
              Pair an Apple Watch with this iPhone, then return here.
            </p>
          )}
          {watch?.available && watch.paired && !watch.installed && (
            <p className="text-xs text-muted-foreground px-1">
              Install Tropos on your Apple Watch using the Watch app on iPhone.
            </p>
          )}
          {watchEnabled && (
            <p className="text-xs text-muted-foreground px-1">
              No heart rate yet? Check Settings → Health → Data Access &amp;
              Devices → Tropos. Apple does not disclose whether a heart rate
              read was denied.
            </p>
          )}
        </div>
      )}

      {(CONNECTED_TRAINING_RELEASED || showPendingExports) && (
        <div className="space-y-3">
          {CONNECTED_TRAINING_RELEASED && (
            <>
              <SectionHeading size="compact">Save workouts</SectionHeading>
              <div className={ROW}>
                <div className={LABEL}>
                  <p className="text-sm text-foreground">
                    Save workouts to Apple Health
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add a completed Tropos run to Apple Health after it syncs.
                    This choice is separate from Watch heart rate.
                  </p>
                  {writeAvailable === false && (
                    <p className="text-xs font-medium text-foreground mt-1">
                      Not available here
                    </p>
                  )}
                  {writeAvailable === true && prefs.saveWorkoutsToHealth && (
                    <p className="text-xs font-medium text-foreground mt-1">
                      {writeAuthorization === "authorized"
                        ? "Ready to save synced runs"
                        : "Apple Health access needs attention"}
                    </p>
                  )}
                </div>
                <Toggle
                  className="ml-auto"
                  checked={
                    writeAvailable === true &&
                    prefs.saveWorkoutsToHealth &&
                    !!uid &&
                    !isWorkoutExportLocallyDisabled(uid)
                  }
                  label="Save workouts to Apple Health"
                  disabled={loading || failed || !!busy || !writeAvailable}
                  onChange={() => void handleExportToggle()}
                />
              </div>
              {writeAvailable === true &&
                prefs.saveWorkoutsToHealth &&
                writeAuthorization !== "authorized" &&
                writeAuthorization !== null && (
                  <Banner
                    variant={
                      writeAuthorization === "denied" ? "warning" : "neutral"
                    }
                    title="Workout access needs attention"
                    description={
                      writeAuthorization === "denied"
                        ? "Allow Tropos to add workouts in Settings → Health → Data Access & Devices → Tropos. Runs remain saved in Tropos."
                        : "This iPhone has not confirmed permission to add workouts to Apple Health. Runs remain saved in Tropos."
                    }
                    action={
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (writeAuthorization === "notDetermined") {
                            await requestWorkoutWritePermission();
                            await refresh();
                          } else {
                            await openHealthSettings();
                          }
                        }}
                      >
                        {writeAuthorization === "notDetermined"
                          ? "Allow access"
                          : "Open settings"}
                      </Button>
                    }
                  />
                )}
            </>
          )}
          {showPendingExports && (
            <div className="p-3 rounded-lg bg-muted space-y-2">
              <p className="text-sm font-medium text-foreground">
                {pendingExports} Apple Health{" "}
                {pendingExports === 1 ? "update" : "updates"} pending
              </p>
              <p className="text-xs text-muted-foreground">
                Check your connection and Apple Health access, then retry. A run
                already saved in Tropos stays saved while this waits.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => void retryExports()}
                >
                  Try again
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void openHealthSettings()}
                >
                  Open settings
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {CONNECTED_TRAINING_RELEASED && failed && (
        <div className="p-3 rounded-lg bg-muted space-y-2">
          <p className="text-sm text-foreground">
            Couldn't load your connected training choices.
          </p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
    </AccordionSection>
  );
}
