/**
 * The two per-day Firestore reads the target-dependent nutrition badges need,
 * on top of the meals the streak hook already windows:
 *  - users/{uid}/dailyNutrition/{date} — the macro-target SNAPSHOT (PR 9)
 *  - users/{uid}/waterLog/{date}       — glasses + targetGlasses
 *
 * Returns raw per-day maps; the join against meal totals + the "did you hit it?"
 * derivation lives in the pure computeNutritionBadgeDays so it stays testable.
 * Consumed once inside the single <StreaksProvider> (the badge hub), so these
 * are two listeners per session, not per consumer. ~60-doc windows comfortably
 * cover the 7-day protein/water streaks with headroom.
 */
import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { DayTargetSnapshot, DayWater } from "@/lib/nutritionBadgeDays";

const DAILY_NUTRITION_LIMIT = 60;
const WATER_LIMIT = 60;

// Stable empty maps for the initial + signed-out state. State maps are only
// ever REPLACED (never mutated) from snapshots, so a shared empty is safe — and
// using a constant (not a fresh `new Map()`) keeps the reset out of the
// set-state-in-effect lint rule, matching useStreaks' DEFAULT_STREAKS pattern.
const EMPTY_MACRO_TARGETS: Map<string, DayTargetSnapshot> = new Map();
const EMPTY_WATER: Map<string, DayWater> = new Map();

export interface NutritionBadgeData {
  /** date → snapshotted target (macros + calories) for that day. */
  macroTargetsByDay: Map<string, DayTargetSnapshot>;
  /** date → { glasses, target } for that day. */
  waterByDay: Map<string, DayWater>;
  loaded: boolean;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function useNutritionBadgeData(): NutritionBadgeData {
  const { user } = useAuth();
  const [macroTargetsByDay, setMacroTargets] =
    useState<Map<string, DayTargetSnapshot>>(EMPTY_MACRO_TARGETS);
  const [waterByDay, setWater] = useState<Map<string, DayWater>>(EMPTY_WATER);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [waterLoaded, setWaterLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      // Deliberate sign-out reset so a previous account's per-day nutrition
      // data can't leak into the next session's badge pass (CLAUDE.md uid-
      // scoping). Runs only on user→null (deps: [user]), so it can't loop —
      // same pattern as useStreaks' DEFAULT_STREAKS reset.
      /* eslint-disable react-hooks/set-state-in-effect */
      setMacroTargets(EMPTY_MACRO_TARGETS);
      setWater(EMPTY_WATER);
      setTargetsLoaded(false);
      setWaterLoaded(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const onErr =
      (source: string, setLoaded: (v: boolean) => void) => (err: unknown) => {
        logger.error(
          `[useNutritionBadgeData] ${source} subscription failed`,
          err
        );
        setLoaded(true); // don't hang the badge pass if one read fails
      };

    const targetsQ = query(
      collection(db, "users", user.uid, "dailyNutrition"),
      orderBy("date", "desc"),
      limit(DAILY_NUTRITION_LIMIT)
    );
    const unsubTargets = onSnapshot(
      targetsQ,
      (snap) => {
        const map = new Map<string, DayTargetSnapshot>();
        for (const d of snap.docs) {
          const raw = d.data() as {
            date?: unknown;
            targetCalories?: unknown;
            targetProtein?: unknown;
            targetCarbs?: unknown;
            targetFat?: unknown;
          };
          const date = typeof raw.date === "string" ? raw.date : d.id;
          if (!date) continue;
          map.set(date, {
            calories: num(raw.targetCalories),
            protein: num(raw.targetProtein),
            carbs: num(raw.targetCarbs),
            fat: num(raw.targetFat),
          });
        }
        setMacroTargets(map);
        setTargetsLoaded(true);
      },
      onErr("dailyNutrition", setTargetsLoaded)
    );

    const waterQ = query(
      collection(db, "users", user.uid, "waterLog"),
      orderBy("updatedAt", "desc"),
      limit(WATER_LIMIT)
    );
    const unsubWater = onSnapshot(
      waterQ,
      (snap) => {
        const map = new Map<string, DayWater>();
        for (const d of snap.docs) {
          const raw = d.data() as {
            glasses?: unknown;
            targetGlasses?: unknown;
          };
          // waterLog docs are keyed by the YYYY-MM-DD date (useWaterLog).
          map.set(d.id, {
            glasses: num(raw.glasses),
            target: num(raw.targetGlasses),
          });
        }
        setWater(map);
        setWaterLoaded(true);
      },
      onErr("waterLog", setWaterLoaded)
    );

    return () => {
      unsubTargets();
      unsubWater();
    };
  }, [user]);

  return {
    macroTargetsByDay,
    waterByDay,
    loaded: targetsLoaded && waterLoaded,
  };
}
