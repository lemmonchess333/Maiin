import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Flag } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { Toggle } from "@/components/ui/Toggle";
import { THEME } from "@/lib/theme";

/**
 * SOC-P2f — the opt-in switch for the public "Training for {race}"
 * identity (TrainingForChip on UserProfile).
 *
 * Renders ONLY on the race space bound to the viewer's own race goal
 * (`profile.raceGoal.eventSpaceId` — the natural home: you're standing
 * in the race's room deciding whether to wear the shirt). Privacy is
 * opt-in by default: the public field is written on toggle, never
 * derived silently from the goal.
 *
 * State: `trainingForSpaceId` on users/{uid}/public/profile — read once
 * on mount (this surface only renders for your own race, so it's one
 * bounded read), written via the guarded setDoc (merge). Optimistic
 * flip with revert-on-error. Rules value-gate the field to known space
 * ids; the chip's display gate handles staleness after race day.
 */
export default function RaceIdentityToggle({ spaceId }: { spaceId: string }) {
  const { user, profile } = useAuth();
  const isYourRace = profile?.raceGoal?.eventSpaceId === spaceId;
  const [shared, setShared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !isYourRace) return;
    let cancelled = false;
    getDoc(doc(db, "users", user.uid, "public", "profile"))
      .then((snap) => {
        if (cancelled) return;
        setShared(snap.data()?.trainingForSpaceId === spaceId);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true); // default off — honest fallback
      });
    return () => {
      cancelled = true;
    };
  }, [user, isYourRace, spaceId]);

  if (!user || !isYourRace || !loaded) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    haptic("light");
    const next = !shared;
    setShared(next);
    try {
      await setDocGuarded(
        doc(db, "users", user.uid, "public", "profile"),
        { trainingForSpaceId: next ? spaceId : null },
        { merge: true }
      );
    } catch (err) {
      logger.error("[RaceIdentity] toggle failed", err);
      setShared(!next);
      toast.error("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="size-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${THEME.running}14` }}
        >
          <Flag className="size-4" style={{ color: THEME.running }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Show on your profile
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            "Training for this race" appears on your public profile
          </p>
        </div>
      </div>
      <Toggle
        checked={shared}
        onChange={toggle}
        disabled={busy}
        label="Show your race on your public profile"
      />
    </div>
  );
}
