/**
 * Post a SAVED workout to the feed, from `/workout/:id`.
 *
 * Distinct from `ShareComposerSheet`, deliberately. That one is driven by
 * the `shareComposer` singleton, fires once inside a save chain, and is
 * governed by the stored "always" default — it answers "what should happen
 * to sessions from now on?". This one answers "post THIS one", is opened by
 * an explicit tap on a record that already exists, and never touches the
 * default. Routing this through `compose()` would either be short-circuited
 * by the stored default (so the button would do nothing for a user whose
 * default is "never" — precisely the user who needs it) or would rewrite
 * their default as a side effect of sharing one workout.
 *
 * The activity payload mirrors the post-save one in `useProgram` so a post
 * made here renders identically in the feed, including the structured
 * `exercises` array that ActivityCard's "Save as routine" flow reads.
 */
import { useState } from "react";
import { Users, Globe } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { recordSharedActivity } from "@/lib/sessionDelete";
import { postActivity } from "@/lib/socialApi";
import { containsProfanity } from "@/lib/profanityFilter";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { workoutTonnageKg, type Workout } from "@/hooks/useWorkouts";
import VerifyEmailNotice from "@/components/social/VerifyEmailNotice";

const CAPTION_MAX = 140;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  workout: Workout;
  /** Display name for the post — the page already derives it from `notes`. */
  title: string;
  /** Called with the new activity id so the page can flip to its
   *  "Shared to your feed" state without a refetch. */
  onShared: (activityId: string) => void;
}

export default function WorkoutFeedShareSheet({
  open,
  onOpenChange,
  uid,
  workout,
  title,
  onShared,
}: Props) {
  const { user, profile } = useAuth();
  const { isOnline } = useOnlineStatus();
  const gate = useEmailVerificationGate(user);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const captionIsProfane = containsProfanity(caption);
  const exercises = workout.exercises ?? [];
  const tonnage = workoutTonnageKg(workout);

  const share = async (visibility: "followers" | "public") => {
    // Held while the email is unverified — the rules refuse the write.
    if (gate.needsVerification) return;
    if (captionIsProfane || posting) {
      if (captionIsProfane) haptic("error");
      return;
    }
    haptic("light");
    setPosting(true);
    try {
      const activityId = await postActivity({
        authorId: uid,
        authorName: profile?.displayName || "Athlete",
        ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
        type: "workout",
        visibility,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        workoutName: title,
        activityTitle: title,
        exerciseCount: exercises.length,
        totalVolume: tonnage,
        duration: (workout.durationMinutes ?? 0) * 60,
        muscleGroups: [
          ...new Set(exercises.map((ex) => ex.category).filter(Boolean)),
        ],
        exercises: exercises.map((ex) => ({
          name: ex.exerciseName,
          sets: ex.sets?.length ?? 0,
          reps: ex.sets?.[0]?.reps ?? 0,
          weightKg: ex.sets?.[0]?.weightKg ?? 0,
        })),
      });

      // Best-effort dedupe marker. If this write fails the post still
      // stands — the only cost is that this page keeps offering the button,
      // which is strictly better than losing the post to a failed marker.
      await recordSharedActivity(
        uid,
        { kind: "workout", id: workout.id },
        activityId
      );

      onShared(activityId);
      onOpenChange(false);
      setCaption("");
      toast.success("Shared to your feed");
    } catch (err) {
      logger.error("[WorkoutDetail] feed share failed:", err);
      toast.error("Couldn't share that workout. Try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share to your feed"
    >
      <div className="px-5 pb-5 pt-3 space-y-4">
        <div className="rounded-xl bg-muted/50 px-3.5 py-3">
          <p className="text-sm font-semibold text-foreground truncate">
            {title}
          </p>
          <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
            {[
              `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`,
              tonnage > 0
                ? `${Math.round(tonnage).toLocaleString()} kg volume`
                : "",
              (workout.durationMinutes ?? 0) > 0
                ? `${workout.durationMinutes} min`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="relative">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
            placeholder="Add a note about this session…"
            rows={2}
            aria-label="Add a note (optional)"
            aria-invalid={captionIsProfane}
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {caption.length > 0 && (
            <span className="absolute bottom-2 right-3 text-caption font-mono tabular-nums text-muted-foreground">
              {caption.length}/{CAPTION_MAX}
            </span>
          )}
        </div>
        {captionIsProfane && (
          <p
            role="alert"
            className="text-xs text-destructive-strong font-medium px-1"
          >
            Please remove objectionable language before sharing.
          </p>
        )}

        {gate.needsVerification && (
          <VerifyEmailNotice onRecheck={gate.recheck} />
        )}

        <div className="space-y-2">
          <Button
            fullWidth
            loading={posting}
            disabled={captionIsProfane || !isOnline || gate.needsVerification}
            onClick={() => share("followers")}
            leftIcon={<Users className="size-4 shrink-0" aria-hidden="true" />}
          >
            Share to followers
          </Button>
          <Button
            fullWidth
            variant="secondary"
            loading={posting}
            disabled={captionIsProfane || !isOnline || gate.needsVerification}
            onClick={() => share("public")}
            leftIcon={<Globe className="size-4 shrink-0" aria-hidden="true" />}
          >
            Make public
          </Button>
        </div>

        {!isOnline && (
          // Unlike the post-save composer there is no queue behind this —
          // the workout is already saved and this page will still be here
          // later, so deferring is honest and losing nothing.
          <p className="text-caption text-muted-foreground text-center">
            You&apos;re offline — come back to this workout when you&apos;re
            connected.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
