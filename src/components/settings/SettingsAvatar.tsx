import { useRef, useState, useCallback } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import type { UserProfile } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { processProfilePhoto, ProfilePhotoProcessingError } from "@/lib/profilePhotoProcessor";
import { uploadProfilePhoto, removeProfilePhoto } from "@/lib/profilePhotoUpload";
import { haptic } from "@/lib/haptic";
import Avatar from "@/components/Avatar";

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
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
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
          console.error("uploadProfilePhoto failed:", err);
          const code = (err as { code?: string } | null)?.code;
          if (code === "storage/unauthorized" || code === "permission-denied") {
            toast.error("Upload not permitted. Try again in a minute — the server may need to update.");
          } else if (code === "storage/canceled") {
            toast.error("Upload cancelled.");
          } else if (code === "storage/retry-limit-exceeded") {
            toast.error("Network is slow. Try again on a stronger connection.");
          } else {
            toast.error(code ? `Couldn't upload (${code}). Try again.` : "Couldn't upload. Try again.");
          }
        }
      } finally {
        setBusy(null);
      }
    },
    [user, refreshProfile],
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
      console.error("removeProfilePhoto failed:", err);
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
        className="relative w-14 h-14 shrink-0 rounded-full active:scale-[0.97] transition-transform"
      >
        {hasPhoto ? (
          <Avatar
            photoURL={profile.photoURL}
            displayName={name || "You"}
            fallbackInitial={initials || undefined}
            size="xl"
            className="w-14 h-14"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center">
            {initials ? (
              <span className="text-lg font-bold text-primary">{initials}</span>
            ) : (
              <Camera className="w-6 h-6 text-primary" />
            )}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card">
          <Camera className="w-3 h-3 text-primary-foreground" />
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

      <Drawer.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border outline-none">
            <div className="mx-auto w-10 h-1 rounded-full bg-border my-3" aria-hidden="true" />
            <div className="px-5 pb-6 space-y-4">
              <div className="flex items-center justify-between">
                <Drawer.Title className="text-lg font-bold text-foreground">
                  Profile photo
                </Drawer.Title>
                <button
                  type="button"
                  onClick={() => !busy && setOpen(false)}
                  aria-label="Close"
                  disabled={!!busy}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Drawer.Description className="text-[13px] text-muted-foreground -mt-2">
                Visible to other Tropos users on your activities, comments and the
                leaderboard. Change or remove it anytime.
              </Drawer.Description>

              <button
                type="button"
                onClick={handlePick}
                disabled={!!busy}
                className="w-full py-3 rounded-xl bg-primary-strong text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 transition-transform"
              >
                {busy === "uploading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
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
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Removing…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Remove photo
                    </>
                  )}
                </button>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
