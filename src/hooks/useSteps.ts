import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import {
  isHealthAvailable,
  requestStepsReadPermission,
  getTodayStepTotal,
} from "@/lib/healthKit";

/**
 * Steps state machine for the Home Steps tile + Settings → Health section
 * (iOS half of POST_LAUNCH.md "Steps tile → HealthKit / Health Connect
 * wiring").
 *
 *  - `unavailable` — web, or a device without Health. The tile hides.
 *  - `unprompted`  — native + Health available + not yet connected. The tile
 *                    shows the "Connect Health" affordance; the priming modal
 *                    may fire (once ever, per `primingShown`).
 *  - `connected`   — connected + a real (>0) step total for today.
 *  - `ambiguous`   — connected but zero/no data. Because iOS never reveals a
 *                    denied READ scope, a denied read and a genuine 0 look
 *                    identical; we render 0 and surface the recovery hint in
 *                    Settings rather than inventing an error the OS won't
 *                    confirm.
 *
 * The persisted flag doc `users/{uid}/settings/healthKit` = `{ primingShown,
 * connected }` (mirrors `usePushSettings`' settings-doc pattern) so priming
 * never re-fires across devices. Foreground refresh reuses the codebase's
 * existing seam — `document`'s `visibilitychange` (the same event
 * `useRunVisibility` / `useWakeLock` listen on) — rather than adding a new
 * `@capacitor/app` listener.
 */
export type StepsStatus =
  | "unavailable"
  | "unprompted"
  | "connected"
  | "ambiguous";

interface HealthKitFlags {
  primingShown: boolean;
  connected: boolean;
}

const DEFAULT_FLAGS: HealthKitFlags = { primingShown: false, connected: false };

export interface UseStepsResult {
  status: StepsStatus;
  steps: number | null;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Persisted flag — surface B (priming modal) reads this to fire at most
   *  once ever. Not part of the tile's needs, but the modal's. */
  primingShown: boolean;
  /** "Not now" on the priming modal — persist `primingShown` without
   *  connecting, so the modal never nags twice. */
  dismissPriming: () => Promise<void>;
}

export function useSteps(): UseStepsResult {
  const { user } = useAuth();
  // Key effects on the uid string, NOT the `user` object — the object
  // reference can change across renders without the identity changing, and a
  // uid-keyed effect can't loop on that churn.
  const uid = user?.uid ?? null;
  const [available, setAvailable] = useState(false);
  const [flags, setFlags] = useState<HealthKitFlags>(DEFAULT_FLAGS);
  const [steps, setSteps] = useState<number | null>(null);
  // Latest flags for the visibilitychange handler (registered once) without
  // re-subscribing on every flag change.
  const flagsRef = useRef(flags);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);
  const availableRef = useRef(available);
  useEffect(() => {
    availableRef.current = available;
  }, [available]);
  // Set once a user action (connect / dismiss) has written flags, so the
  // async hydration load never clobbers a tap that landed mid-load.
  const flagsDirtyRef = useRef(false);

  const settingsRef = useCallback(() => {
    if (!uid) return null;
    return doc(db, "users", uid, "settings", "healthKit");
  }, [uid]);

  const persist = useCallback(
    async (next: Partial<HealthKitFlags>) => {
      const ref = settingsRef();
      flagsDirtyRef.current = true;
      const merged = { ...flagsRef.current, ...next };
      setFlags(merged);
      if (!ref) return;
      try {
        await setDocGuarded(ref, merged, { merge: true });
      } catch (err) {
        logger.error("[steps] settings save failed", err);
      }
    },
    [settingsRef]
  );

  const fetchSteps = useCallback(async () => {
    const total = await getTodayStepTotal();
    setSteps(total);
  }, []);

  // Load: availability + persisted flags, then today's steps if connected.
  useEffect(() => {
    let alive = true;
    (async () => {
      const avail = await isHealthAvailable();
      if (!alive) return;
      setAvailable(avail);
      if (!avail || !uid) return;
      const ref = doc(db, "users", uid, "settings", "healthKit");
      let loaded = DEFAULT_FLAGS;
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          loaded = {
            ...DEFAULT_FLAGS,
            ...(snap.data() as Partial<HealthKitFlags>),
          };
        }
      } catch (err) {
        logger.error("[steps] settings load failed", err);
      }
      if (!alive) return;
      // If the user already tapped connect/dismiss during the load, don't
      // clobber their write with the hydrated (older) flags.
      if (!flagsDirtyRef.current) setFlags(loaded);
      if ((flagsDirtyRef.current ? flagsRef.current : loaded).connected)
        await fetchSteps();
    })();
    return () => {
      alive = false;
    };
  }, [uid, fetchSteps]);

  const refresh = useCallback(async () => {
    if (!availableRef.current || !flagsRef.current.connected) return;
    await fetchSteps();
  }, [fetchSteps]);

  // Foreground refresh via the existing visibilitychange seam.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const connect = useCallback(async () => {
    // iOS never reports a denied READ scope, so this resolves "granted" on a
    // completed request; the connected-but-zero case becomes `ambiguous`.
    await requestStepsReadPermission();
    await persist({ connected: true, primingShown: true });
    await fetchSteps();
  }, [persist, fetchSteps]);

  const dismissPriming = useCallback(async () => {
    await persist({ primingShown: true });
  }, [persist]);

  const status: StepsStatus = !available
    ? "unavailable"
    : !flags.connected
      ? "unprompted"
      : steps && steps > 0
        ? "connected"
        : "ambiguous";

  return {
    status,
    steps,
    connect,
    refresh,
    primingShown: flags.primingShown,
    dismissPriming,
  };
}
