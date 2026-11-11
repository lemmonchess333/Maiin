import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, type DocumentData } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";
import {
  isReminderLocallyOff,
  setReminderLocallyOff,
} from "@/lib/localReminderChoice";

/** Account-scoped persistence shared by the two independent schedulers. */
export function useReminderPreferences<T extends { enabled: boolean }>(
  uid: string | null,
  kind: "meal" | "workout",
  defaults: T
) {
  const documentName = `${kind}Reminders`;
  const [reminders, setReminders] = useState<T>(defaults);
  const [readState, setReadState] = useState({
    uid: null as string | null,
    loading: true,
    failed: false,
  });
  // A new account is unknown on its first render, before effects run.
  const loading = readState.uid !== uid || readState.loading;
  const failed = readState.uid === uid && readState.failed;
  const [saving, setSaving] = useState(false);
  const sessionRef = useRef({
    uid,
    active: false,
    pending: 0,
    revision: 0,
    fields: {} as Partial<Record<keyof T, number>>,
  });
  useEffect(() => {
    const session = {
      uid,
      active: true,
      pending: 0,
      revision: 0,
      fields: {} as Partial<Record<keyof T, number>>,
    };
    sessionRef.current = session;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saving belongs to this account session
    setSaving(false);
    return () => {
      session.active = false;
    };
  }, [uid]);
  const [readVersion, setReadVersion] = useState(0);
  const retry = useCallback(() => setReadVersion((version) => version + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear account-owned loading on sign-out
      setReadState({ uid, loading: false, failed: false });
      return;
    }
    setReadState({ uid, loading: true, failed: false });
    const ref = doc(db, "users", uid, "settings", documentName);
    getDoc(ref)
      .then((snap) => {
        if (cancelled) return;
        setReminders({
          ...defaults,
          ...(snap.exists() ? (snap.data() as T) : {}),
          ...(isReminderLocallyOff(uid, kind) ? { enabled: false } : {}),
        });
        setReadState({ uid, loading: false, failed: false });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error(`[${documentName}] load failed`, err);
        setReadState({ uid, loading: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, readVersion, defaults, kind, documentName]);

  const updateReminders = useCallback(
    async (updates: Partial<T>) => {
      const session = sessionRef.current;
      const turningOff = updates.enabled === false;
      if (
        !session.active ||
        session.uid !== uid ||
        !uid ||
        loading ||
        failed ||
        (session.pending > 0 && !turningOff)
      )
        throw new Error("Reminder settings aren’t ready. Try again.");
      // Persist before showing off or cancelling the OS alarms. A failed
      // server write must not make an old on choice win after a restart.
      if (turningOff) {
        if (!setReminderLocallyOff(uid, kind, true))
          throw new Error(
            "Couldn’t remember your reminder choice. Free device storage and try again."
          );
        setReminders((current) => ({ ...current, ...updates }));
      }
      const revision = ++session.revision;
      for (const key of Object.keys(updates) as (keyof T)[])
        session.fields[key] = revision;
      session.pending++;
      setSaving(true);
      try {
        await setDocGuarded<DocumentData>(
          doc(db, "users", uid, "settings", documentName),
          updates,
          { merge: true }
        );
        if (!session.active) return;
        // Acknowledgements belong to the fields they wrote. A newer Off
        // owns enabled, while an older time edit may still have succeeded.
        const acknowledged = Object.fromEntries(
          Object.entries(updates).filter(
            ([key]) => session.fields[key as keyof T] === revision
          )
        ) as Partial<T>;
        if (
          acknowledged.enabled === true &&
          !setReminderLocallyOff(uid, kind, false)
        )
          throw new Error("Couldn’t remember your reminder choice. Try again.");
        setReminders((current) => ({ ...current, ...acknowledged }));
      } catch (err) {
        logger.error(`[${documentName}] save failed`, err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          {
            surface: `${documentName}.save`,
          }
        );
        throw new Error(
          turningOff
            ? "Your choice to turn reminders off is saved on this phone, but couldn’t sync to your account."
            : "Couldn’t save reminder settings. Try again.",
          { cause: err }
        );
      } finally {
        session.pending--;
        if (session.active) setSaving(session.pending > 0);
      }
    },
    [uid, loading, failed, kind, documentName]
  );

  return { reminders, loading, failed, saving, retry, updateReminders };
}
