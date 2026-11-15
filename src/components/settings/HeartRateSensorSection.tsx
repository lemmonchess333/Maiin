import { useEffect, useRef, useState } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { haptic } from "@/lib/haptic";
import { isNativePlatform } from "@/lib/platform";
import { useHeartRateSensor } from "@/hooks/useHeartRateSensor";
import {
  forgetHeartRateSensor,
  openHeartRateSensorSettings,
  pairHeartRateSensor,
  previewHeartRateSensor,
  scanForHeartRateSensors,
  subscribeHeartRateSensorReadings,
  type HeartRateSensorStatus,
  type PairedSensor,
} from "@/lib/heartRateSensorBridge";

/**
 * Settings → Run plan: pair or forget a Bluetooth heart rate sensor, a chest
 * strap or an armband speaking the standard Heart Rate Service. Beside the
 * zones it feeds.
 *
 * Pairing happens in the iPhone app (`heartRateSensorBridge.ts`); on web
 * the section says so and what a sensor gives a run, which is its
 * web-visible path. Searching is the first thing that asks iOS for
 * Bluetooth, so the prompt follows a tap, never the page opening.
 */

/** How long a search runs before it gives up, ms: a strap advertises once
 *  it is worn and wakes, which takes a few seconds. A Tropos heuristic. */
const SEARCH_FOR_MS = 30_000;

/** A shown reading is dropped after this long without another, ms. */
const READING_STALE_MS = 10_000;

const WHAT_IT_GIVES =
  "A Bluetooth chest strap or armband shows your heart rate on a run, gives a cue when your heart rate stays above Zone 2 on an easy run, and adds time in zones to the run’s summary.";

function blockedReason(
  status: HeartRateSensorStatus
): { title: string; body: string; settings: boolean } | null {
  if (status.authorization === "denied" || status.bluetooth === "unauthorized")
    return {
      title: "Bluetooth is off for Tropos",
      body: "Allow Bluetooth for Tropos in Settings to pair and use a sensor.",
      settings: true,
    };
  if (status.authorization === "restricted")
    return {
      title: "Bluetooth isn’t allowed here",
      body: "This iPhone doesn’t allow Tropos to use Bluetooth.",
      settings: false,
    };
  if (status.bluetooth === "unsupported")
    return {
      title: "No Bluetooth sensors here",
      body: "This iPhone can’t connect to Bluetooth sensors.",
      settings: false,
    };
  return null;
}

export default function HeartRateSensorSection() {
  const native = isNativePlatform();
  const { status, loaded, setStatus } = useHeartRateSensor();
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<PairedSensor[]>([]);
  const [noneFound, setNoneFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const stopSearchRef = useRef<(() => void) | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const pairedId = status.paired?.id ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSearchRef.current?.();
      stopSearchRef.current = null;
      if (searchTimerRef.current != null)
        window.clearTimeout(searchTimerRef.current);
    };
  }, []);

  // The paired sensor's reading, kept connected while it is on screen.
  useEffect(() => {
    if (!native || !pairedId) return;
    let active = true;
    let lastAt = 0;
    let unlisten: () => void = () => {};
    void previewHeartRateSensor(true);
    void subscribeHeartRateSensorReadings((sample) => {
      if (!active) return;
      lastAt = Date.now();
      setBpm(sample.bpm);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    const stale = window.setInterval(() => {
      if (lastAt && Date.now() - lastAt > READING_STALE_MS) setBpm(null);
    }, 2_000);
    return () => {
      active = false;
      unlisten();
      window.clearInterval(stale);
      void previewHeartRateSensor(false);
      setBpm(null);
    };
  }, [native, pairedId]);

  function endSearch(timedOut: boolean) {
    stopSearchRef.current?.();
    stopSearchRef.current = null;
    if (searchTimerRef.current != null)
      window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    setSearching(false);
    setNoneFound(timedOut);
  }

  async function startSearch() {
    haptic("light");
    setError(null);
    setFound([]);
    setNoneFound(false);
    setSearching(true);
    const stop = await scanForHeartRateSensors((sensor) =>
      setFound((list) =>
        list.some((known) => known.id === sensor.id) ? list : [...list, sensor]
      )
    );
    if (!mountedRef.current) {
      stop();
      return;
    }
    stopSearchRef.current = stop;
    searchTimerRef.current = window.setTimeout(
      () => endSearch(true),
      SEARCH_FOR_MS
    );
  }

  async function pair(sensor: PairedSensor) {
    endSearch(false);
    setBusy(true);
    setError(null);
    const next = await pairHeartRateSensor(sensor.id);
    if (!mountedRef.current) return;
    setBusy(false);
    if (next?.paired) {
      setStatus(next);
      haptic("success");
    } else {
      setError("Couldn’t pair that sensor. Try again.");
    }
  }

  async function forget() {
    haptic("light");
    setBusy(true);
    setError(null);
    const next = await forgetHeartRateSensor();
    if (!mountedRef.current) return;
    setBusy(false);
    if (next) setStatus(next);
    else setError("Couldn’t forget the sensor. Try again.");
  }

  const blocked = status.available ? blockedReason(status) : null;
  const radioOff = status.available && status.bluetooth === "poweredOff";

  return (
    <div className="space-y-3">
      <SectionHeading size="compact">Heart rate sensor</SectionHeading>
      <div className="rounded-xl bg-card border border-border/40 p-3 space-y-3">
        {!loaded ? (
          <Spinner size="sm" variant="muted" label="Checking for a sensor" />
        ) : !status.available ? (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {native
                ? "Update Tropos to pair a sensor"
                : "Pair a sensor in the iPhone app"}
            </p>
            <p className="text-xs text-muted-foreground">{WHAT_IT_GIVES}</p>
          </div>
        ) : blocked ? (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {blocked.title}
            </p>
            <p className="text-xs text-muted-foreground">{blocked.body}</p>
            {blocked.settings && (
              <Button
                variant="ghost"
                className="mt-1"
                onClick={() => void openHeartRateSensorSettings()}
              >
                Open settings
              </Button>
            )}
          </div>
        ) : status.paired ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-[min(100%,8em)] flex-1">
              <p className="text-sm font-semibold text-foreground">
                {status.paired.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {radioOff ? (
                  "Bluetooth is off. Turn it on in Control Center."
                ) : status.connection === "connected" ? (
                  bpm != null ? (
                    <>
                      Connected ·{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {bpm}
                      </span>{" "}
                      bpm
                    </>
                  ) : (
                    "Connected"
                  )
                ) : status.connection === "connecting" ? (
                  "Connecting… Put it on so it wakes up."
                ) : (
                  "Connects when you start a run."
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              className="ml-auto"
              loading={busy}
              onClick={() => void forget()}
            >
              Forget
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                No sensor paired
              </p>
              <p className="text-xs text-muted-foreground">
                {radioOff
                  ? "Bluetooth is off. Turn it on in Control Center to pair a sensor."
                  : "Pair a Bluetooth chest strap or armband to see your heart rate on runs. Put it on so it wakes up."}
              </p>
            </div>
            {searching ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner
                    size="sm"
                    variant="muted"
                    label="Looking for sensors"
                  />
                  <span>Looking for sensors…</span>
                </div>
                {found.map((sensor) => (
                  <div
                    key={sensor.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-1.5"
                  >
                    <span className="min-w-[min(100%,8em)] flex-1 text-sm text-foreground">
                      {sensor.name}
                    </span>
                    <Button
                      variant="secondary"
                      className="ml-auto"
                      disabled={busy}
                      onClick={() => void pair(sensor)}
                    >
                      Pair
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => endSearch(false)}>
                  Stop
                </Button>
              </div>
            ) : (
              <>
                {noneFound && (
                  <p className="text-xs text-muted-foreground">
                    No sensor found. Check it’s on and close by, then try again.
                  </p>
                )}
                <Button
                  variant="secondary"
                  loading={busy}
                  disabled={radioOff}
                  onClick={() => void startSearch()}
                >
                  Pair a sensor
                </Button>
              </>
            )}
          </div>
        )}
        {error && <p className="text-xs text-destructive-strong">{error}</p>}
      </div>
    </div>
  );
}
