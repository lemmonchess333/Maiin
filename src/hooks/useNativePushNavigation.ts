import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { listenForNativePushActions } from "@/lib/nativePush";
import { nativePushRoute } from "@/lib/nativePushRoute";
import { logger } from "@/lib/logger";
import { pushReminderKind } from "@/lib/reminderAttention";

/** Hold a cold-start tap until Auth and the router are ready. */
export function useNativePushNavigation(
  uid: string | null,
  ready: boolean
): void {
  const navigate = useNavigate();
  const pending = useRef<unknown>(null);
  const consume = useCallback(() => {
    if (!uid || !ready || pending.current === null) return;
    const data = pending.current;
    pending.current = null;
    const route = nativePushRoute(data, uid);
    if (route) void navigate(route);
    // Opened from a reminder's push: its answer (App1 Q62), for this
    // account's own pushes only. Loaded on the tap, so a first visit's
    // code still starts no Firestore.
    const kind = route
      ? pushReminderKind((data as { type?: unknown }).type)
      : null;
    if (kind)
      void import("@/lib/reminderAnswers")
        .then(({ markReminderAnswered }) => markReminderAnswered(uid, kind))
        .catch((error) => {
          logger.warn("[push] saving the reminder's answer failed", error);
        });
  }, [uid, ready, navigate]);

  useEffect(() => {
    consume();
  }, [consume]);
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void listenForNativePushActions((data) => {
      if (cancelled) return;
      pending.current = data;
      consume();
    })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((error) => {
        if (!cancelled)
          logger.warn("[push] native notification tap listener failed", error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [consume]);
}
