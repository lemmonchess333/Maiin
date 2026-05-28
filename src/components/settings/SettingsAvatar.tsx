import { useRef, useState, useCallback } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import type { UserProfile } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import {
  processProfilePhoto,
  ProfilePhotoProcessingError,
} from "@/lib/profilePhotoProcessor";
import {
  uploadProfilePhoto,
  removeProfilePhoto,
} from "@/lib/profilePhotoUpload";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import Avatar from "@/components/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Settings header avatar + entry point for the profile-photo upload
 * flow. Tapping opens a bottom sheet with "Choose a new photo" /
 * "Remove photo" actions and the consent copy that establishes
 * up-front that profile photos are visible to other Tropos users.
 *
 * The component is intentionally self-contained — pulls user from
 * useAuth, owns its file input ref + sheet open state + upload
 * status — so the parent Settings page only renders `<SettingsAvatar
 * profile={profile} />` without wiring up callbacks.
 */
export default function SettingsAvatar({ profile }: { profile: UserProfile }) {
  const { user, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);

  const hasPhoto = !!profile.photoURL;
  const name = profile.displayName || "";
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  const handlePick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      /* Reset the input *before* awaiting anything async so the same
         file can be re-picked after a failure. */
      e.target.value = "";
      if (!file || !user) return;

      setBusy("uploading");
      haptic("light");
      try {
        const blob = await processProfilePhoto(file);
        await uploadProfilePhoto(user.uid, blob);
        await refreshProfile();
        haptic("success");
        toast.success("Profile photo updated");
        setOpen(false);
      } catch (err) {
        if (err instanceof ProfilePhotoProcessingError) {
          /* Specific message per error code — better UX than a
             generic "couldn't upload". HEIC in particular has a
             concrete remediation the user can act on. */
          toast.error(err.message);
        } else {
          /* Storage / Firestore failures land here. The most common
             failure mode in early production is a permission-denied
             from Storage rules (typically because the deployed
             rules pre-date the profile-photos/{uid}/ path). Surface
             the error code so users can self-diagnose without us
             needing remote logs — Firebase errors carry a `code`
             field like 'storage/unauthorized' or 'permission-denied'. */
          logger.error("uploadProfilePhoto failed:", err);
          const code = (err as { code?: string } | null)?.code;
          if (code === "storage/unauthorized" || code === "permission-denied") {
            toast.error(
              "Upload not permitted. Try again in a minute — the server may need to update."
            );
          } else if (code === "storage/canceled") {
            toast.error("Upload cancelled.");
          } else if (code === "storage/retry-limit-exceeded") {
            toast.error("Network is slow. Try again on a stronger connection.");
          } else {
            toast.error(
              code
                ? `Couldn't upload (${code}). Try again.`
                : "Couldn't upload. Try again."
            );
          }
        }
      } finally {
        setBusy(null);
      }
    },
    [user, refreshProfile]
  );

  const handleRemove = useCallback(async () => {
    if (!user) return;
    setBusy("removing");
    haptic("light");
    try {
      await removeProfilePhoto(user.uid);
      await refreshProfile();
      toast.success("Profile photo removed");
      setOpen(false);
    } catch (err) {
      logger.error("removeProfilePhoto failed:", err);
      toast.error("Couldn't remove. Try again.");
    } finally {
      setBusy(null);
    }
  }, [user, refreshProfile]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change profile photo"
        className="relative size-14 shrink-0 rounded-full active:scale-[0.97] transition-transform"
      >
        {hasPhoto ? (
          <Avatar
            photoURL={profile.photoURL}
            displayName={name || "You"}
            fallbackInitial={initials || undefined}
            size="xl"
            className="size-14"
          />
        ) : (
          <div className="size-full rounded-full bg-primary/20 flex items-center justify-center">
            {initials ? (
              <span className="text-lg font-bold text-primary">{initials}</span>
            ) : (
              <Camera className="size-6 text-primary" />
            )}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-primary flex items-center justify-center border-2 border-card">
          <Camera className="size-3 text-primary-foreground" />
        </div>
      </button>

      {/* Hidden picker — controlled by the bottom-sheet "Choose new
          photo" action. accept restricts to formats we can decode;
          HEIC is also caught at the processor layer for belt-and-
          braces because some browsers report empty MIME for picked
          files. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* Sprint 3 follow-up sweep: vaul boilerplate replaced with the
          shared BottomSheet primitive. The bespoke X close button is
          gone — vaul/BottomSheet handles dismissal via drag, backdrop,
          and escape (the original X duplicated those affordances).
          Spinner primitive replaces the two inline Loader2 spinners. */}
      <BottomSheet
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title="Profile photo"
        description="Visible to other Tropos users on your activities, comments and the leaderboard. Change or remove it anytime."
        dismissible={!busy}
      >
        <div className="px-5 pb-6 pt-3 space-y-4">
          <button
            type="button"
            onClick={handlePick}
            disabled={!!busy}
            className="w-full py-3 rounded-xl bg-primary-strong text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 transition-transform"
          >
            {busy === "uploading" ? (
              <>
                <Spinner size="sm" variant="inverse" label="Uploading photo" />
                Uploading…
              </>
            ) : (
              <>
                <Camera className="size-4" />
                {hasPhoto ? "Choose a new photo" : "Choose a photo"}
              </>
            )}
          </button>

          {hasPhoto && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={!!busy}
              className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 transition-transform"
            >
              {busy === "removing" ? (
                <>
                  <Spinner size="sm" variant="muted" label="Removing photo" />
                  Removing…
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Remove photo
                </>
              )}
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
