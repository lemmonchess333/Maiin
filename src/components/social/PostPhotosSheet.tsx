/**
 * The photos on one of your shared sessions (Soc15 call 2): add up to
 * four, take any off.
 *
 * Opened from the finish screen's posted row (SessionShareRow), where most
 * posts are made, and from your own post's page (`/activity/:activityId`),
 * at any time. The share sheet has no picker: a photo goes on a post that
 * exists, as its map does, and is named on it only once it is uploaded and
 * screened (postPhotoUpload.ts).
 *
 * The picker is the plain file input: in the iPhone app it offers the
 * photo library and the camera (Info.plist names both uses), several at
 * once. Each photo is added in the order picked, as many as there is room
 * for. What happens to each is said on the sheet: a refused photo gets the
 * screen's sentence, any other failure a plain one with Try again, and the
 * photos that passed are added all the same.
 *
 * Offline, nothing can upload or be taken off, so both are off and the
 * sheet says why. A restricted account adds photos to its private posts
 * only (S4e), and an account that has not verified its email to none,
 * as firestore.rules hold them; either may still take its photos off.
 */
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import VerifyEmailNotice from "@/components/social/VerifyEmailNotice";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { PHOTO_REFUSED_MESSAGE } from "@/lib/photoScreen";
import { POST_PHOTO_MAX, type PostPhoto } from "@/lib/postPhotos";
import { addPostPhotos, removePostPhoto } from "@/lib/postPhotoUpload";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { POST_PHOTOS_COPY } from "./postPhotosCopy";

const photosWord = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);

/** What the last add said, shown under the photos until the next. */
type Outcome = {
  added: number;
  refused: number;
  failed: Blob[];
  /** Picked but over the four. */
  leftOut: number;
};

export default function PostPhotosSheet({
  open,
  onOpenChange,
  activityId,
  photos,
  onPhotosChange,
  visibility,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string;
  /** The post's photos as they stand. */
  photos: PostPhoto[];
  /** Told the post's new list after every add and removal. */
  onPhotosChange: (photos: PostPhoto[]) => void;
  /** Who sees the post: a restricted account adds to a private one only. */
  visibility?: string;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { isOnline } = useOnlineStatus();
  const restriction = useRestrictedStatus(uid ?? undefined);
  const gate = useEmailVerificationGate(user);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Photos being uploaded now, by count. */
  const [adding, setAdding] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const busy = adding > 0 || removing !== null;
  const room = POST_PHOTO_MAX - photos.length;
  const restricted =
    !restriction.loading &&
    restriction.isRestricted &&
    visibility !== "private";
  const mayAdd = !restricted && !gate.needsVerification;

  const add = async (files: Blob[], leftOut = 0) => {
    if (!uid || files.length === 0 || busy) return;
    haptic("light");
    setOutcome(null);
    setAdding(files.length);
    const result = await addPostPhotos({
      uid,
      activityId,
      current: photos,
      files,
    });
    setAdding(0);
    if (result.added > 0) onPhotosChange(result.photos);
    if (result.refused > 0 || result.failed.length > 0) haptic("error");
    setOutcome({
      added: result.added,
      refused: result.refused,
      failed: result.failed,
      leftOut,
    });
  };

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    // The same photo can be picked again after it was taken off.
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    const files = picked.slice(0, Math.max(0, room));
    void add(files, picked.length - files.length);
  };

  const remove = async (photoId: string) => {
    if (!uid || busy) return;
    haptic("light");
    setRemoving(photoId);
    setOutcome(null);
    try {
      onPhotosChange(
        await removePostPhoto({ uid, activityId, current: photos, photoId })
      );
    } catch (err) {
      logger.warn("[PostPhotosSheet] remove failed:", err);
      haptic("error");
      toast.error("Couldn't remove the photo. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  const status =
    adding > 0
      ? `Adding ${photosWord(adding)}…`
      : outcome && outcome.added > 0
        ? `Added ${photosWord(outcome.added)}.`
        : "";

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        // An upload under way finishes before the sheet closes.
        if (!next && adding > 0) return;
        if (!next) setOutcome(null);
        onOpenChange(next);
      }}
      title={POST_PHOTOS_COPY.title}
    >
      <div className="px-4 pb-6 space-y-4 overflow-y-auto min-h-0">
        <p className="text-sm text-muted-foreground">
          {POST_PHOTOS_COPY.about}
        </p>

        {(photos.length > 0 || adding > 0) && (
          /* One row of four at most, so the sheet's own buttons stay in
             view on the smallest phone. */
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((photo, i) => (
              <li
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={photo.url}
                  alt={`${i + 1} of ${photos.length} on this post`}
                  width={photo.w}
                  height={photo.h}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 size-full object-cover"
                />
                {/* The whole 44px corner is the target; the circle in it
                    is what shows, so a small tile keeps its photo. */}
                <IconButton
                  onClick={() => void remove(photo.id)}
                  aria-label={`Remove photo ${i + 1}`}
                  icon={
                    <span className="grid size-6 place-items-center rounded-full bg-card/90 text-foreground shadow-sm">
                      <X className="size-3.5" aria-hidden />
                    </span>
                  }
                  loading={removing === photo.id}
                  disabled={!isOnline || (busy && removing !== photo.id)}
                  className="absolute right-0 top-0 rounded-full hover:bg-transparent"
                />
              </li>
            ))}
            {Array.from({ length: adding }, (_, i) => (
              <li
                key={`adding-${i}`}
                className="relative grid aspect-square place-items-center rounded-xl bg-muted"
              >
                <Spinner size="md" variant="muted" label="Adding photo" />
              </li>
            ))}
          </ul>
        )}

        <p
          role="status"
          className={status ? "text-sm text-foreground" : "sr-only"}
        >
          {status}
        </p>

        {outcome &&
          (outcome.refused > 0 ||
            outcome.failed.length > 0 ||
            outcome.leftOut > 0) && (
            <div role="alert" className="space-y-2">
              {outcome.leftOut > 0 && (
                <p className="text-sm text-muted-foreground">
                  A post holds up to 4 photos, so {photosWord(outcome.leftOut)}{" "}
                  you picked {outcome.leftOut === 1 ? "wasn't" : "weren't"}{" "}
                  added.
                </p>
              )}
              {outcome.refused > 0 && (
                <p className="text-sm text-destructive-strong">
                  {PHOTO_REFUSED_MESSAGE}
                </p>
              )}
              {outcome.failed.length > 0 && (
                <>
                  <p className="text-sm text-destructive-strong">
                    Couldn&apos;t add {photosWord(outcome.failed.length)}. Check
                    your connection and try again.
                  </p>
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={!isOnline || busy || !mayAdd}
                    onClick={() =>
                      void add(outcome.failed.slice(0, Math.max(0, room)))
                    }
                  >
                    {POST_PHOTOS_COPY.retry}
                  </Button>
                </>
              )}
            </div>
          )}

        {restricted ? (
          <RestrictedNotice />
        ) : gate.needsVerification ? (
          <VerifyEmailNotice onRecheck={gate.recheck} />
        ) : room <= 0 ? (
          <p className="text-sm text-muted-foreground">
            {POST_PHOTOS_COPY.full}
          </p>
        ) : (
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-hidden
              tabIndex={-1}
              data-testid="post-photos-input"
              onChange={(e) => pick(e.target.files)}
            />
            <Button
              variant="primary"
              fullWidth
              leftIcon={<Camera className="size-4" aria-hidden />}
              disabled={!isOnline || busy}
              loading={adding > 0}
              onClick={() => inputRef.current?.click()}
            >
              {POST_PHOTOS_COPY.add}
            </Button>
            {!isOnline && (
              <p className="text-xs text-muted-foreground">
                {POST_PHOTOS_COPY.offline}
              </p>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          fullWidth
          disabled={adding > 0}
          onClick={() => {
            setOutcome(null);
            onOpenChange(false);
          }}
        >
          {POST_PHOTOS_COPY.done}
        </Button>
      </div>
    </BottomSheet>
  );
}
