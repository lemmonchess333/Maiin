/**
 * Muscle Recovery — per-muscle readiness on the body diagram (competitive
 * doc Tier-2 #6, second half; Fitbod's moat). Lives on the Programme Lift
 * tab below WeeklyVolumeCard, speaking the SAME canonical-muscle language
 * (both derive attribution from volumeModel).
 *
 * Data: a one-shot fetch of the last RECOVERY_LOOKBACK_DAYS of saved
 * workouts (the WorkoutSession-prefill pattern — no live listener; the
 * state only changes when a session is saved, which remounts this tab).
 * The model itself is pure and unit-tested (src/lib/muscleRecovery.ts).
 *
 * Visual rules: purple = lifting domain — a RECOVERING muscle is "still
 * loaded" (full lifting purple), NEARLY is the light shade, READY is the
 * untinted silhouette. Static render — no glow, no loops (one-ambient-loop
 * rule stays owned by the analytics heat map). Cold start (no attributable
 * lifts in the window) renders nothing — no fake "all recovered" state for
 * users who haven't lifted.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import Model, { type IExerciseData } from "react-body-highlighter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  computeMuscleRecovery,
  hitsFromWorkoutDocs,
  RECOVERY_LOOKBACK_DAYS,
  type MuscleRecoveryEntry,
} from "@/lib/muscleRecovery";
import type { CanonicalMuscle } from "@/features/program/volumeModel";

/** Canonical muscle → react-body-highlighter region ids (same ids the
 *  analytics MuscleHeatMap paints, at volumeModel's finer granularity). */
const BODY_REGIONS: Record<CanonicalMuscle, IExerciseData["muscles"]> = {
  Chest: ["chest"],
  Back: ["upper-back", "lower-back"],
  Shoulders: ["front-deltoids", "back-deltoids"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Quads: ["quadriceps"],
  Hamstrings: ["hamstring"],
  Glutes: ["gluteal"],
  Calves: ["calves"],
  Core: ["abs", "obliques"],
};

const NEARLY_COLOR = THEME.liftingLight;
const RECOVERING_COLOR = THEME.lifting;

// Same dark-mode resubscribe pattern as MuscleHeatMap: recolour the
// silhouette when Settings toggles .dark on documentElement at runtime.
function subscribeDarkMode(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

export default function MuscleRecoveryCard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MuscleRecoveryEntry[] | null>(null);
  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getIsDark,
    () => false
  );
  const bodyColor = isDark ? "#2A2A30" : "#e8e8f0";

  useEffect(() => {
    if (!user?.uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sign-out reset must clear the fetched state
      setEntries(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const today = new Date();
        const windowStart = new Date(today);
        windowStart.setDate(windowStart.getDate() - RECOVERY_LOOKBACK_DAYS);
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "workouts"),
            where("date", ">=", localDateString(windowStart)),
            orderBy("date", "desc"),
            limit(30)
          )
        );
        if (cancelled) return;
        const hits = hitsFromWorkoutDocs(snap.docs.map((d) => d.data()));
        // No attributable lifting in the window → cold-start collapse.
        setEntries(
          hits.length === 0
            ? []
            : computeMuscleRecovery(hits, localDateString(today))
        );
      } catch (err) {
        logger.error("[MuscleRecoveryCard] workouts fetch failed", err);
        if (!cancelled) setEntries([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const notReady = useMemo(
    () => (entries ?? []).filter((e) => e.status !== "ready"),
    [entries]
  );

  // Diagram data: only not-ready muscles are tinted. frequency indexes into
  // highlightedColors: 1 → nearly (light), 2 → recovering (full purple).
  const diagramData: IExerciseData[] = useMemo(
    () =>
      notReady.map((e) => ({
        name: e.muscle,
        muscles: BODY_REGIONS[e.muscle],
        frequency: e.status === "recovering" ? 2 : 1,
      })),
    [notReady]
  );

  // Loading or cold start — render nothing (quiet, no skeleton flash for a
  // secondary context card).
  if (!entries || entries.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card p-4 shadow-card space-y-3 mt-3">
      <div>
        <SectionLabel>Muscle recovery</SectionLabel>
        <p className="text-xs text-muted-foreground mt-0.5">
          From your last {RECOVERY_LOOKBACK_DAYS} days of lifting
        </p>
      </div>

      <div className="flex items-center justify-center gap-6" aria-hidden>
        <Model
          data={diagramData}
          style={{ width: 110 }}
          highlightedColors={[NEARLY_COLOR, RECOVERING_COLOR]}
          bodyColor={bodyColor}
          type="anterior"
        />
        <Model
          data={diagramData}
          style={{ width: 110 }}
          highlightedColors={[NEARLY_COLOR, RECOVERING_COLOR]}
          bodyColor={bodyColor}
          type="posterior"
        />
      </div>

      {notReady.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center">
          All muscle groups recovered — train anything.
        </p>
      ) : (
        <div className="space-y-1.5">
          {notReady.map((e) => (
            <div key={e.muscle} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  background:
                    e.status === "recovering" ? RECOVERING_COLOR : NEARLY_COLOR,
                }}
                aria-hidden
              />
              <span className="flex-1 text-foreground">{e.muscle}</span>
              <span className="text-muted-foreground">
                {e.status === "recovering" ? "recovering" : "nearly there"}
                {" · ready in ~"}
                <span className="font-mono tabular-nums">{e.readyInDays}</span>d
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
