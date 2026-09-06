import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Button } from "@/components/ui/Button";
import { useStreakReminder } from "@/hooks/RemindersProvider";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";

/**
 * One-time priming modal for the streak-at-risk reminder.
 *
 * Trigger rule: shown after a completed session when the user has
 * `currentStreak ≥ 1` and `primingShown === false`. Once shown (regardless
 * of response) the flag flips to true and the modal never re-fires.
 *
 * The floor moved from ≥ 2 to ≥ 1 (D-1, frontend-design-principles-2026-07):
 * the first completed session is the value moment — consent asked there
 * powers the once-ever day-2 return nudge, whereas waiting for streak 2
 * meant a brand-new user could never receive any first-week return trigger.
 * At streak 1 the copy drops the loss-aversion "keep your streak" framing
 * (there's nothing to lose yet) for a calm day-two offer.
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

  // Latest eligibility check, held in a ref (useLatest) so the mount-once
  // listener always reads fresh loading / prefs / currentStreak values
  // without re-registration. Returns true once it has opened the modal so
  // the retry loop below can stop. Preserves the once-ever gate
  // (primingShown) and the streak floor (>= 1 — the first completed
  // session); the SurfaceCoordinator still applies the frequency cap.
  const checkRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    checkRef.current = () => {
      if (loading) return false;
      if (prefs.primingShown) return false;
      if (currentStreak < 1) return false;
      setOpen(true);
      return true;
    };
  });

  // Trigger rule (audit #10): the priming modal fires ONLY after a session is
  // completed (post-celebration) — a workout or a valid saved run — never on
  // app-open, foreground/visibilitychange, or any page mount — landing on the
  // Programme page (or anywhere) must never pop it mid-task. The old
  // seed-on-first-render + visibilitychange triggers did exactly that and were
  // removed. Runs joined workouts with the ≥ 1 floor: a run-first user's
  // first session is just as much the consent value moment (meals stay out —
  // a modal after a routine food log would interrupt the Food flow).
  //
  // `currentStreak` settles asynchronously via the useStreaks snapshot after
  // the session save, so the handler re-checks on a short bounded interval
  // until the freshly-earned streak value lands (or it gives up after ~4s).
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const onSessionComplete = () => {
      if (retryRef.current) clearInterval(retryRef.current);
      if (checkRef.current()) return;
      let tries = 0;
      retryRef.current = setInterval(() => {
        tries += 1;
        if (checkRef.current() || tries >= 12) {
          if (retryRef.current) clearInterval(retryRef.current);
          retryRef.current = null;
        }
      }, 350);
    };
    window.addEventListener("tropos:workout-completed", onSessionComplete);
    window.addEventListener("tropos:run-completed", onSessionComplete);
    return () => {
      window.removeEventListener("tropos:workout-completed", onSessionComplete);
      window.removeEventListener("tropos:run-completed", onSessionComplete);
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, []);

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
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/55"
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
              // D10: align the streak flame to the design-system amber
              // token (the canonical StreakFlame uses THEME.amber) instead
              // of a one-off #ff7832. Alpha suffixes are opacity bytes, not
              // colour literals: 1F ≈ 12%, 59 ≈ 35%.
              backgroundColor: `${THEME.amber}1F`,
              border: `1.5px solid ${THEME.amber}59`,
            }}
          >
            <Flame className="size-7" color={THEME.amber} strokeWidth={2.25} />
          </div>
        </div>
        <div className="space-y-1">
          <p
            id="streak-priming-title"
            className="text-lg font-bold text-foreground"
          >
            {currentStreak < 2
              ? "That's day one done"
              : "Keep your streak alive"}
          </p>
          <p
            id="streak-priming-body"
            className="text-sm text-muted-foreground leading-snug"
          >
            {currentStreak < 2 ? (
              <>
                Want a reminder tomorrow evening so day two doesn&apos;t slip?
                You can change this anytime in Settings.
              </>
            ) : (
              <>
                We&apos;ll remind you in the evening if you haven&apos;t logged,
                so you don&apos;t lose your {currentStreak}-day streak. You can
                change this anytime in Settings.
              </>
            )}
          </p>
        </div>
        <div className="space-y-2 pt-2">
          <Button fullWidth onClick={onYes}>
            Yes, remind me
          </Button>
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
