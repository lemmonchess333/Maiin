import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useUid } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { mealSlotFor } from "@/lib/mealSlots";
import { DEFAULT_PUSH_CONSENT } from "@/lib/pushConsent";
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
    workout: boolean;
    run: boolean;
    loaded: string[];
    pushOwns: boolean | null;
  }>({
    key: "",
    meals: [],
    workout: false,
    run: false,
    loaded: [],
    pushOwns: null,
  });
  const key = `${uid ?? ""}:${clock.dateKey}`;
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
                workout: false,
                run: false,
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
      onSnapshot(dated("workouts"), (snap) =>
        publish("workouts", {
          workout: snap.docs.some((d) => !d.data().deletedAt),
        })
      ),
      onSnapshot(
        query(
          collection(db, "users", uid, "runs"),
          where("completedAt", ">=", Timestamp.fromDate(start)),
          where("completedAt", "<", Timestamp.fromDate(end))
        ),
        (snap) =>
          publish("runs", {
            run: snap.docs.some(
              (d) => !d.data().isInvalid && Number(d.data().distance) > 0
            ),
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
        ["meals", "workouts", "runs"].every((source) =>
          current.loaded.includes(source)
        ),
      dateKey: clock.dateKey,
      meals: current?.meals ?? [],
      workout: !!(current?.workout || current?.run),
    } satisfies ReminderActivity,
    pushOwns: current?.pushOwns ?? null,
    refreshKey: `${key}:${clock.opened}`,
  };
}
