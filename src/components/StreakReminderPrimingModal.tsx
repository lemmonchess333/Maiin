import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useStreakReminder } from "@/hooks/RemindersProvider";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";

/**
 * One-time priming modal for the streak-at-risk reminder.
 *
 * Trigger rule: shown on a foreground event when the user has
 * `currentStreak ≥ 2` and `primingShown === false`. Once shown (regardless
 * of response) the flag flips to true and the modal never re-fires.
 *
 * Deliberately does NOT trigger when the streak hits 2 mid-session via a
 * fresh log — that would interrupt a user who just logged something with
 * a feature pitch. The effect has no state deps on currentStreak; the
 * only re-evaluation triggers are (a) visibilitychange fires with
 * `visible`, and (b) the one-shot seed when prefs finish loading after
 * mount. No render-driven re-checks.
 *
 * Dismiss behaviours (Yes / No / swipe-to-dismiss / tap outside) all set
 * `primingShown` so the user is never re-prompted. Yes additionally flips
 * `enabled` on and requests OS permission. No / dismiss flip `enabled` off.
 */

export function StreakReminderPrimingModal() {
  const { prefs, loading, updatePrefs, requestPermission, currentStreak } =
    useStreakReminder();
  // `open` is now the ELIGIBILITY signal (this modal wants to show); the
  // coordinator decides whether it actually shows this app-open (#995). Lowest
  // tier-4 priority — a permission prime always yields to trial / fell-behind /
  // badge, and defers to a later foreground if it loses.
  const [open, setOpen] = useState(false);
  const surface = useSurface({ id: "priming", priority: 10, eligible: open });

  // Latest eligibility check, held in a ref so the mount-once listener
  // always reads fresh values without needing re-registration. Updated
  // after every render inside a deps-less effect (standard useLatest
  // pattern) so the closure always sees the newest loading / prefs /
  // currentStreak values.
  const checkRef = useRef<() => void>(() => {});
  useEffect(() => {
    checkRef.current = () => {
      if (loading) return;
      if (prefs.primingShown) return;
      if (currentStreak < 2) return;
      setOpen(true);
    };
  });

  // Single mount-once effect: register the visibilitychange listener and
  // tear it down on unmount. Empty deps — the listener reads through the
  // ref so no re-registration is ever needed when values change.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // One-shot seed: fire the check exactly once, the first render where
  // `loading === false`. First app-open after sign-in qualifies as a
  // foreground event for priming purposes. The latch ref prevents
  // subsequent prefs / streak state changes from re-triggering the
  // modal mid-session.
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (didSeedRef.current) return;
    didSeedRef.current = true;
    checkRef.current();
  }, [loading]);

  const close = useCallback(() => {
    setOpen(false);
    surface.dismiss();
  }, [surface]);

  const handleYes = useCallback(async () => {
    haptic("medium");
    close();
    // Mark priming as shown first — if the permission prompt hangs or
    // the user backgrounds to Settings, we must not re-prompt.
    try {
      const granted = await requestPermission();
      await updatePrefs({
        primingShown: true,
        enabled: granted,
      });
    } catch (err) {
      // updatePrefs already calls captureError on Firestore write failure;
      // this is a last-chance log so the UI error stays visible in dev.
      logger.error("[StreakPriming] handleYes failed", err);
    }
  }, [close, requestPermission, updatePrefs]);

  const handleNo = useCallback(async () => {
    haptic("light");
    close();
    try {
      await updatePrefs({ primingShown: true, enabled: false });
    } catch (err) {
      logger.error("[StreakPriming] handleNo failed", err);
    }
  }, [close, updatePrefs]);

  return (
    <AnimatePresence>
      {surface.active && (
        <PrimingDialog
          currentStreak={currentStreak}
          onYes={handleYes}
          onNo={handleNo}
        />
      )}
    </AnimatePresence>
  );
}

function PrimingDialog({
  currentStreak,
  onYes,
  onNo,
}: {
  currentStreak: number;
  onYes: () => void;
  onNo: () => void;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.55)" }}
      // Tap-outside / backdrop click → treated as "No thanks" per the spec:
      // user saw the prompt and chose to ignore it.
      onClick={onNo}
      role="presentation"
    >
      <motion.div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="streak-priming-title"
        aria-describedby="streak-priming-body"
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 10 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl p-6 text-center space-y-4 shadow-2xl bg-card"
      >
        <div className="flex justify-center">
          <div
            className="size-14 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "rgba(255,120,50,0.12)",
              border: "1.5px solid rgba(255,120,50,0.35)",
            }}
          >
            <Flame className="size-7" color="#ff7832" strokeWidth={2.25} />
          </div>
        </div>
        <div className="space-y-1">
          <p
            id="streak-priming-title"
            className="text-lg font-bold text-foreground"
          >
            Keep your streak alive
          </p>
          <p
            id="streak-priming-body"
            className="text-sm text-muted-foreground leading-snug"
          >
            We&apos;ll remind you in the evening if you haven&apos;t logged, so
            you don&apos;t lose your {currentStreak}-day streak. You can change
            this anytime in Settings.
          </p>
        </div>
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={onYes}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
          >
            Yes, remind me
          </button>
          <button
            type="button"
            onClick={onNo}
            className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-medium text-sm"
          >
            No thanks
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
