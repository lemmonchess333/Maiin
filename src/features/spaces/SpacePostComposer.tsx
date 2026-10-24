/**
 * Space post composer (Spc1 PR3) — title + body + optional attached
 * logged session, in the shared BottomSheet. Members only (the rules
 * enforce membership server-side; the entry button is join-gated).
 *
 * The attachment is a DENORMALISED SNAPSHOT captured at post time
 * (feed idiom — render without follow-up reads): a workout carries
 * volume/exercise-count/muscle categories, a run carries
 * distance/pace/route (route downsampled to bound doc size). Photo
 * attach arrives with the PR4 storage slice.
 *
 * Profanity check is client-side UX only, same posture as CommentSheet;
 * report/block + official moderation delete are the real teeth.
 */
import { useRef, useState } from "react";
import { collection, serverTimestamp } from "firebase/firestore";
import { Camera, Dumbbell, Footprints, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import {
  containsProfanity,
  OBJECTIONABLE_POST_MESSAGE,
} from "@/lib/profanityFilter";
import { uploadSpacePostPhoto } from "@/lib/spacePhotoUpload";
import { PhotoRefusedError } from "@/lib/photoScreen";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SustainedOfflineBanner from "@/components/ui/SustainedOfflineBanner";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import VerifyEmailNotice from "@/components/social/VerifyEmailNotice";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { recentSessionDay, type RecentSession } from "./useRecentSessions";
import { spacePostSnapshot } from "./spacePostSnapshot";
import { distanceLabel } from "@/lib/runLabels";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { IconButton } from "@/components/ui/IconButton";

const TITLE_MAX = 120;
const BODY_MAX = 4000;

function attachableLabel(a: RecentSession, unit: DistanceUnit): string {
  if (a.kind === "run") {
    return `${distanceLabel(a.run.distance, unit)} run`;
  }
  const names = a.workout.exercises
    .slice(0, 2)
    .map((e) => e.exerciseName)
    .join(", ");
  return `Workout · ${names}${a.workout.exercises.length > 2 ? "…" : ""}`;
}

export default function SpacePostComposer({
  spaceId,
  open,
  onOpenChange,
  onPosted,
  sessions,
  attachLatest = false,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
  /** The caller's recent sessions, newest first (`useRecentSessions`). */
  sessions: RecentSession[];
  /** Start with the newest of `sessions` attached — the empty space's
   *  "Share your last session" opens the composer this way. The user can
   *  remove it or pick another; either choice sticks for this draft. */
  attachLatest?: boolean;
}) {
  const { user, profile } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const unit = useDistanceUnit();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<RecentSession | null>(null);
  /* Set once the user removes the session attachLatest put there, so the
     latest does not reattach itself on the next render. */
  const [latestRemoved, setLatestRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Photo attach (Spc1 PR4 — the operator's Runna-parity amendment).
     Preview via object URL, revoked on remove/replace. */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File | null) => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setPhotoFile(file);
  };

  /* Derived rather than copied into state: the sessions load after the
     sheet opens, and the latest one should appear when they arrive. */
  const attached =
    picked ?? (attachLatest && !latestRemoved ? (sessions[0] ?? null) : null);

  const profane = containsProfanity(title) || containsProfanity(body);
  // Space posts are public content: the rules refuse an unverified email
  // and a restricted account (S4e), so the action is held here and the
  // notice below says why.
  const canPost =
    body.trim().length > 0 &&
    !profane &&
    !busy &&
    !gate.needsVerification &&
    !isRestricted;

  const submit = async () => {
    if (!user || !canPost) return;
    // Offline, an awaited Firestore write never settles (the SDK parks it
    // until the server answers) and a photo cannot upload at all. A
    // text-only post is committed to the local cache at call time and
    // replays on reconnect, so it counts as posted; a photo post is held
    // with the draft intact.
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline && photoFile) {
      haptic("error");
      toast.error(
        "Photos need a connection. Remove the photo to post now, or try again when you're back online."
      );
      return;
    }
    setBusy(true);
    /* Photo uploads FIRST — it's core post content (unlike the diary's
       enhancement posture), so a failed upload keeps the sheet open
       with the draft intact instead of posting half a post. */
    let photoUrl: string | null = null;
    if (photoFile) {
      try {
        photoUrl = await uploadSpacePostPhoto(user.uid, photoFile);
      } catch (error) {
        haptic("error");
        toast.error(
          error instanceof PhotoRefusedError
            ? error.message
            : "Photo upload failed. Try again, or remove the photo to post without it."
        );
        setBusy(false);
        return;
      }
    }
    const write = addDocGuarded(collection(db, "spaces", spaceId, "posts"), {
      authorId: user.uid,
      authorName: profile?.displayName || "Athlete",
      /* Only include when it's a real URL — a null photoURL (profile
         without an avatar) fails the rules' `is string` check;
         stripUndefined only strips undefined, not null. */
      ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      body: body.trim(),
      ...(attached
        ? {
            activity: spacePostSnapshot(
              attached,
              profile?.hideSharedRouteEnds === false
            ),
          }
        : {}),
      ...(photoUrl ? { photoUrl } : {}),
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
    });
    const finish = (message: string) => {
      haptic("light");
      toast.success(message);
      setTitle("");
      setBody("");
      setPicked(null);
      setLatestRemoved(false);
      pickPhoto(null);
      onOpenChange(false);
      onPosted();
    };
    if (offline) {
      write.catch((err) =>
        logger.warn("[SpacePostComposer] queued post rejected", err)
      );
      finish("Post queued. It goes up when you reconnect.");
      setBusy(false);
      return;
    }
    try {
      await write;
      finish("Posted");
    } catch {
      haptic("error");
      toast.error("Couldn't post. Check you've joined the space.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="New post">
      {/* min-h-0 + overflow-y-auto: the sheet is flex-col capped at
          85vh with NO internal scroll of its own — with a photo
          preview attached this content exceeds the cap and the Post
          button became unreachable (caught by the rig's photo-post
          drive). This wrapper makes the composer body scroll. */}
      <div className="px-4 pb-6 space-y-4 overflow-y-auto min-h-0">
        {/* A composer opened while already offline gets no 30s grace: its
            own mount is the first chance to say what will happen. */}
        <SustainedOfflineBanner thresholdMs={0} bannerKey="space-post-offline">
          Text posts save on this device and go up when you reconnect. Photos
          need a connection.
        </SustainedOfflineBanner>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Title (optional)"
          aria-label="Post title"
          className="ds-input text-sm font-semibold"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          placeholder="Share something with the space…"
          aria-label="Post body"
          rows={5}
          className="ds-input resize-none text-sm leading-snug"
        />
        {profane && (
          <p
            className="text-xs"
            style={{ color: "hsl(var(--warning-strong))" }}
          >
            {OBJECTIONABLE_POST_MESSAGE}
          </p>
        )}

        {/* Photo attach — hidden input, Button trigger, preview with
            remove. accept="image/*" surfaces camera + library on iOS. */}
        <div className="space-y-2">
          <SectionLabel>Photo</SectionLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={photoPreview}
                alt="Attachment preview"
                className="w-full max-h-64 object-cover"
              />
              <IconButton
                onClick={() => pickPhoto(null)}
                aria-label="Remove photo"
                icon={<X />}
                className="absolute top-2 right-2 rounded-full bg-card/90 hover:bg-card"
              />
            </div>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Camera className="size-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Add a photo
            </Button>
          )}
        </div>

        {/* Attach a recent session */}
        {sessions.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Attach a session</SectionLabel>
            {attached ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60">
                {attached.kind === "run" ? (
                  <Footprints
                    className="size-4 shrink-0"
                    style={{ color: THEME.running }}
                  />
                ) : (
                  <Dumbbell
                    className="size-4 shrink-0"
                    style={{ color: THEME.lifting }}
                  />
                )}
                <span className="flex-1 text-sm font-medium text-foreground truncate">
                  {attachableLabel(attached, unit)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {recentSessionDay(attached)}
                </span>
                <IconButton
                  onClick={() => {
                    setPicked(null);
                    setLatestRemoved(true);
                  }}
                  aria-label="Remove attached session"
                  icon={<X />}
                  className="-m-2 text-muted-foreground hover:text-foreground"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPicked(a)}
                    className="w-full flex items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 text-left transition-colors"
                  >
                    {a.kind === "run" ? (
                      <Footprints
                        className="size-4 shrink-0"
                        style={{ color: THEME.running }}
                      />
                    ) : (
                      <Dumbbell
                        className="size-4 shrink-0"
                        style={{ color: THEME.lifting }}
                      />
                    )}
                    <span className="flex-1 text-sm text-foreground truncate">
                      {attachableLabel(a, unit)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {recentSessionDay(a)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isRestricted ? (
          <RestrictedNotice />
        ) : (
          gate.needsVerification && (
            <VerifyEmailNotice onRecheck={gate.recheck} />
          )
        )}

        <Button
          variant="primary"
          fullWidth
          onClick={submit}
          loading={busy}
          disabled={!canPost}
        >
          Post to space
        </Button>
      </div>
    </BottomSheet>
  );
}
