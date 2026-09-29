import { useRef, useState } from "react";
import { Plus, RotateCcw, Share2, Trash2, X } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import Spinner from "@/components/ui/Spinner";
import ProgressPhotoThumb from "./ProgressPhotoThumb";
import {
  POSES,
  POSE_LABELS,
  isDayKey,
  moveClashes,
  photosOfDay,
  type Pose,
  type ProgressDay,
  type ProgressPhoto,
} from "@/lib/progressPhotos";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import { joinHumanList } from "@/lib/listFormat";
import { haptic } from "@/lib/haptic";

const dayLabel = (date: string) => formatDayMonthYear(parseLocalDate(date));

/** What to say when an upload fails. The upload's own errors are
 *  written to be shown; the SDK's are not. */
function uploadErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return "Couldn't upload the photo. Try again.";
  }
  if (err instanceof Error && err.message === "Upload timed out") {
    return "The upload timed out. Check your connection and try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't upload the photo. Try again.";
}

/**
 * One day's photos: pick the date, then tap Front, Side or Back. Each
 * photo saves as it is picked, and tapping a photo replaces it. Delete
 * asks first, since a deleted photo is gone. Changing the date of a day
 * that has photos moves them all, unless the new day already has a
 * photo of the same pose.
 */
export default function ProgressPhotoDaySheet({
  open,
  date,
  days,
  urls,
  decrypting,
  onDateChange,
  onClose,
  add,
  remove,
  move,
  onShare,
}: {
  open: boolean;
  /** The day the sheet shows, "YYYY-MM-DD". */
  date: string;
  /** Every day with photos: this one, and the targets of a move. */
  days: readonly ProgressDay[];
  urls: Readonly<Record<string, string>>;
  decrypting: ReadonlySet<string>;
  onDateChange: (date: string) => void;
  onClose: () => void;
  add: (
    file: File,
    where: { date: string; pose: Pose },
    replacing?: ProgressPhoto
  ) => Promise<void>;
  remove: (photo: ProgressPhoto) => Promise<void>;
  move: (photos: readonly ProgressPhoto[], date: string) => Promise<void>;
  /** Null where this device cannot hand an image on. */
  onShare: ((photo: ProgressPhoto) => Promise<void>) | null;
}) {
  const today = localDateString();
  const day = days.find((d) => d.date === date);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPoseRef = useRef<Pose | null>(null);
  const [uploading, setUploading] = useState<Pose | null>(null);
  const [error, setError] = useState<{
    message: string;
    retry?: { file: File; pose: Pose };
  } | null>(null);
  const [confirming, setConfirming] = useState<ProgressPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const busy = uploading !== null || deleting || moving;

  const upload = async (file: File, pose: Pose) => {
    if (!navigator.onLine) {
      setError({ message: "Adding a photo needs a connection." });
      return;
    }
    setUploading(pose);
    setError(null);
    try {
      await add(file, { date, pose }, day?.byPose[pose]);
      haptic("success");
    } catch (err) {
      setError({ message: uploadErrorMessage(err), retry: { file, pose } });
    } finally {
      setUploading(null);
    }
  };

  const pick = (pose: Pose) => {
    haptic("light");
    pendingPoseRef.current = pose;
    fileInputRef.current?.click();
  };

  const confirmDelete = async () => {
    if (!confirming) return;
    if (!navigator.onLine) {
      setError({ message: "Deleting a photo needs a connection." });
      setConfirming(null);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await remove(confirming);
      setConfirming(null);
    } catch {
      setError({ message: "Couldn't delete the photo. Try again." });
    } finally {
      setDeleting(false);
    }
  };

  const confirmMove = async () => {
    if (!day || !draftDate || draftDate === date) return;
    const clashes = moveClashes(days, date, draftDate);
    if (clashes.length > 0) {
      setError({
        message: `${dayLabel(draftDate)} already has a ${joinHumanList(
          clashes.map((pose) => POSE_LABELS[pose].toLowerCase())
        )} photo. Delete one of them first.`,
      });
      return;
    }
    setMoving(true);
    setError(null);
    try {
      await move(photosOfDay(day), draftDate);
      onDateChange(draftDate);
      setDraftDate(null);
    } catch {
      setError({ message: "Couldn't change the date. Try again." });
    } finally {
      setMoving(false);
    }
  };

  const share = async (photo: ProgressPhoto) => {
    if (!onShare) return;
    setSharing(photo.id);
    try {
      await onShare(photo);
    } finally {
      setSharing(null);
    }
  };

  const photoActions = (photo: ProgressPhoto) => (
    <div className="flex justify-center">
      {onShare && (
        <IconButton
          icon={<Share2 className="size-4" />}
          aria-label={`Share ${POSE_LABELS[photo.pose].toLowerCase()} photo`}
          loading={sharing === photo.id}
          disabled={busy || sharing !== null}
          onClick={() => void share(photo)}
        />
      )}
      <IconButton
        icon={<Trash2 className="size-4" />}
        aria-label={`Delete ${POSE_LABELS[photo.pose].toLowerCase()} photo`}
        disabled={busy}
        onClick={() => {
          setError(null);
          setConfirming(photo);
        }}
      />
    </div>
  );

  const validDraft =
    draftDate !== null &&
    isDayKey(draftDate) &&
    draftDate <= today &&
    draftDate !== date;

  const dateEditor = (
    <div className="space-y-1.5">
      <SectionLabel as="span">Date taken</SectionLabel>
      <input
        aria-label="Date taken"
        type="date"
        className="ds-input min-h-11 w-full"
        value={draftDate ?? date}
        max={today}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          if (day) setDraftDate(next);
          else if (isDayKey(next) && next <= today) onDateChange(next);
        }}
      />
      {day && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!validDraft}
            loading={moving}
            onClick={() => void confirmMove()}
          >
            Move photos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={moving}
            onClick={() => setDraftDate(null)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={day ? dayLabel(date) : "Add photos"}
      description="Private to your account. Front, side and back are each optional."
    >
      <div className="space-y-4 px-5 pb-5 pt-3">
        {!day && dateEditor}

        <div className="grid grid-cols-3 gap-2">
          {POSES.map((pose) => {
            const photo = day?.byPose[pose];
            const label = POSE_LABELS[pose];
            return (
              <div key={pose} className="space-y-1">
                <button
                  type="button"
                  aria-label={
                    photo
                      ? `Replace ${label.toLowerCase()} photo`
                      : `Add ${label.toLowerCase()} photo`
                  }
                  disabled={busy}
                  onClick={() => pick(pose)}
                  className="block w-full rounded-lg transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  {photo && uploading !== pose ? (
                    <ProgressPhotoThumb
                      url={urls[photo.id]}
                      decrypting={decrypting.has(photo.id)}
                      label={label}
                    />
                  ) : (
                    <span className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
                      {uploading === pose ? (
                        <Spinner
                          size="sm"
                          variant="muted"
                          label={`Uploading ${label.toLowerCase()}`}
                        />
                      ) : (
                        <Plus aria-hidden className="size-4" />
                      )}
                      <span className="text-xs font-medium">{label}</span>
                    </span>
                  )}
                </button>
                {photo && photoActions(photo)}
              </div>
            );
          })}
        </div>

        {day && day.extras.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Also from this day</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {day.extras.map((photo) => (
                <div key={photo.id} className="space-y-1">
                  <ProgressPhotoThumb
                    url={urls[photo.id]}
                    decrypting={decrypting.has(photo.id)}
                    label={POSE_LABELS[photo.pose]}
                  />
                  {photoActions(photo)}
                </div>
              ))}
            </div>
          </div>
        )}

        {uploading !== null && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Encrypting and uploading the photo…
          </p>
        )}

        {confirming && (
          <div className="space-y-3 rounded-xl bg-destructive/10 p-3">
            <p className="text-sm text-foreground">
              Delete the {POSE_LABELS[confirming.pose].toLowerCase()} photo from{" "}
              {dayLabel(confirming.date)}? It can't be recovered.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                loading={deleting}
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirming(null)}
              >
                Keep
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3"
          >
            <p className="flex-1 break-words text-xs text-destructive-strong">
              {error.message}
            </p>
            {error.retry && (
              <IconButton
                icon={<RotateCcw className="size-4" />}
                aria-label="Try the upload again"
                className="-my-2.5 text-destructive-strong"
                onClick={() => {
                  const { file, pose } = error.retry!;
                  void upload(file, pose);
                }}
              />
            )}
            <IconButton
              icon={<X className="size-4" />}
              aria-label="Dismiss"
              className="-my-2.5 text-destructive-strong"
              onClick={() => setError(null)}
            />
          </div>
        )}

        {day && draftDate !== null && dateEditor}

        {day && draftDate === null ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setError(null);
                setDraftDate(date);
              }}
            >
              Change date
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={onClose}
          >
            Done
          </Button>
        )}

        {/* No `capture`: iOS then offers the library as well as the
            camera, so photos taken earlier can be added on their day. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Choose a progress photo"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const pose = pendingPoseRef.current;
            if (file && pose) void upload(file, pose);
          }}
        />
      </div>
    </BottomSheet>
  );
}
