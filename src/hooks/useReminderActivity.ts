import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useUid } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { mealSlotFor } from "@/lib/mealSlots";
import { DEFAULT_PUSH_CONSENT } from "@/lib/pushConsent";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { SAVED_WORKOUTS } from "@/lib/savedWorkouts";
import type { MealKey } from "@/components/food/mealConstants";

export interface ReminderActivity {
  ready: boolean;
  dateKey: string;
  meals: readonly MealKey[];
  workout: boolean;
}

/** Today's source records, including other-device and optimistic local writes. */
export function useReminderActivity() {
  const uid = useUid();
  const [clock, setClock] = useState(() => ({
    dateKey: localDateString(),
    opened: 0,
  }));
  const [state, setState] = useState<{
    key: string;
    meals: MealKey[];
    loaded: string[];
    pushOwns: boolean | null;
  }>({
    key: "",
    meals: [],
    loaded: [],
    pushOwns: null,
  });
  const key = `${uid ?? ""}:${clock.dateKey}`;
  // Today's sessions by the day they started (Lift3), as the streak counts
  // them, with any saved on this phone and not yet synced among them.
  const today = uid ? { since: clock.dateKey, until: clock.dateKey } : null;
  const todaysWorkouts = useSavedSessions(SAVED_WORKOUTS, uid, today);
  const todaysRuns = useSavedRuns(today);
  const ranToday = todaysRuns.runs.some(
    (run) => !run.isInvalid && run.distance > 0
  );
  useEffect(() => {
    const tick = () =>
      setClock((old) =>
        localDateString() === old.dateKey
          ? old
          : { ...old, dateKey: localDateString() }
      );
    const open = () => {
      if (document.visibilityState !== "hidden")
        setClock((old) => ({
          dateKey: localDateString(),
          opened: old.opened + 1,
        }));
    };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", open);
    document.addEventListener("visibilitychange", open);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", open);
      document.removeEventListener("visibilitychange", open);
    };
  }, []);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const publish = (source: string, value: Partial<typeof state>) => {
      if (cancelled) return;
      setState((old) => {
        const current =
          old.key === key
            ? old
            : {
                key,
                meals: [],
                loaded: [],
                pushOwns: null,
              };
        return {
          ...current,
          ...value,
          loaded: [...new Set([...current.loaded, source])],
        };
      });
    };
    const start = parseLocalDate(clock.dateKey);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dated = (name: string) =>
      query(
        collection(db, "users", uid, name),
        where("date", ">=", clock.dateKey),
        where("date", "<", localDateString(end))
      );
    const unsubscribers = [
      onSnapshot(dated("meals"), (snap) =>
        publish("meals", {
          meals: snap.docs
            .filter((d) => !d.data().deletedAt)
            .map((d) => mealSlotFor(d.data())),
        })
      ),
      onSnapshot(doc(db, "users", uid, "settings", "push"), (snap) => {
        const consent = { ...DEFAULT_PUSH_CONSENT, ...snap.data() };
        publish("push", {
          pushOwns: consent.enabled === true && consent.streak === true,
        });
      }),
    ];
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, key, clock.dateKey]);
  const current = state.key === key ? state : null;
  return {
    activity: {
      ready:
        !!current &&
        todaysRuns.answered &&
        todaysWorkouts.answered &&
        current.loaded.includes("meals"),
      dateKey: clock.dateKey,
      meals: current?.meals ?? [],
      workout: !!current && (todaysWorkouts.items.length > 0 || ranToday),
    } satisfies ReminderActivity,
    pushOwns: current?.pushOwns ?? null,
    refreshKey: `${key}:${clock.opened}`,
  };
}
