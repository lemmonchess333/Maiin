import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { hasNotificationPermission } from "@/lib/notifications";
import {
  REMINDERS_SETTINGS_DOC,
  type ReminderKind,
} from "@/lib/reminderChoices";
import {
  pushRemindersToAnswer,
  quietToShow,
  reminderAttentionFields,
} from "@/lib/reminderAttention";
import { takeReminderCount } from "@/lib/reminderFires";
import { writeReminderAttention } from "@/lib/reminderAnswers";

/** What the attention pass needs of each reminder: whether it is on, and
 *  the way to turn it off. `ready` once its settings are read. */
export interface ReminderSwitch {
  ready: boolean;
  on: boolean;
  turnOff: () => Promise<void>;
}

type Switches = Record<ReminderKind, ReminderSwitch>;

/**
 * App1 Q62, run once a session by <RemindersProvider>
 * (`lib/reminderAttention.ts` has the rule). Whenever the app comes to the
 * front (`refreshKey`), once every reminder's settings are read:
 *
 *   1. A push reminder sent earlier today is answered, since the app is
 *      open (`{kind}AnsweredAt`; the server settles it at its next push).
 *   2. The phone's own reminders are counted (`reminderFires.ts`); a kind
 *      ignored three times running is turned off, with the mark Home reads.
 *   3. A kind the server turned off while the app was open is shown off
 *      here too, once, so Settings says what the server does.
 *
 * Returns the kinds Home says went quiet (still off, not yet said) and the
 * way to record that it has said so.
 */
export function useReminderAttention(
  uid: string | null,
  refreshKey: string,
  switches: Switches
) {
  const [stored, setStored] = useState<{
    uid: string;
    reminders: Record<string, unknown>;
  } | null>(null);
  const latest = useRef(switches);
  useEffect(() => {
    latest.current = switches;
  });
  const ready = Object.values(switches).every((entry) => entry.ready);

  useEffect(() => {
    if (!uid || !ready) return;
    let cancelled = false;
    const pass = async () => {
      const ref = doc(db, "users", uid, "settings", REMINDERS_SETTINGS_DOC);
      const snap = await getDoc(ref);
      if (cancelled) return;
      const reminders = (snap.exists() ? snap.data() : {}) as Record<
        string,
        unknown
      >;
      const patch: Record<string, unknown> = {};
      const answeredAt = serverTimestamp();
      for (const kind of pushRemindersToAnswer(reminders, Date.now()))
        patch[reminderAttentionFields(kind).answeredAt] = answeredAt;

      // Turned off by the server while this session had it on: shown off.
      for (const kind of ["streak", "review"] as const) {
        const fields = reminderAttentionFields(kind);
        const entry = latest.current[kind];
        if (
          reminders[`${kind}Enabled`] === false &&
          reminders[fields.quietAt] &&
          reminders[fields.quietShown] !== true &&
          entry.on
        )
          await entry.turnOff().catch(() => {});
      }

      const quiet = takeReminderCount(await hasNotificationPermission());
      const quietAt = serverTimestamp();
      const marked: Record<string, unknown> = {};
      for (const kind of quiet) {
        const entry = latest.current[kind];
        if (!entry.on) continue;
        try {
          await entry.turnOff();
        } catch (error) {
          logger.warn(
            "[ReminderAttention] turning a reminder off failed",
            error
          );
          continue;
        }
        const fields = reminderAttentionFields(kind);
        Object.assign(patch, {
          [fields.quietAt]: quietAt,
          [fields.quietShown]: false,
        });
        Object.assign(marked, {
          [fields.quietAt]: Date.now(),
          [fields.quietShown]: false,
        });
      }
      if (cancelled) return;
      setStored({ uid, reminders: { ...reminders, ...marked } });
      await writeReminderAttention(uid, patch);
    };
    pass().catch((error) => {
      logger.warn("[ReminderAttention] pass failed", error);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, ready, refreshKey]);

  const reminders = stored?.uid === uid ? stored.reminders : null;
  // Only while it is still off: turned back on, there is nothing to say.
  const quietKey = quietToShow(reminders)
    .filter((kind) => switches[kind].ready && !switches[kind].on)
    .join(",");
  const quiet = useMemo(
    () => (quietKey ? (quietKey.split(",") as ReminderKind[]) : []),
    [quietKey]
  );

  const markShown = useCallback(
    async (kinds: readonly ReminderKind[]) => {
      if (!uid || kinds.length === 0) return;
      const patch = Object.fromEntries(
        kinds.map((kind) => [reminderAttentionFields(kind).quietShown, true])
      );
      setStored((current) =>
        current?.uid === uid
          ? { ...current, reminders: { ...current.reminders, ...patch } }
          : current
      );
      await writeReminderAttention(uid, patch).catch((error) => {
        logger.warn("[ReminderAttention] saving the shown mark failed", error);
      });
    },
    [uid]
  );

  return useMemo(() => ({ quiet, markShown }), [quiet, markShown]);
}
