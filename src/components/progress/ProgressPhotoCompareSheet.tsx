import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SectionLabel from "@/components/ui/SectionLabel";
import ProgressPhotoThumb from "./ProgressPhotoThumb";
import {
  POSES,
  POSE_LABELS,
  sharedPoses,
  type Pose,
  type ProgressDay,
  type ProgressPhoto,
} from "@/lib/progressPhotos";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";

const dayLabel = (date: string) => formatDayMonthYear(parseLocalDate(date));

/**
 * Two days side by side, pose against pose. It opens on the first day
 * and the latest; either can be changed, and only the poses both days
 * have can be picked.
 */
export default function ProgressPhotoCompareSheet({
  open,
  days,
  initial,
  urls,
  decrypting,
  ensureDecrypted,
  onClose,
  onShare,
}: {
  open: boolean;
  days: readonly ProgressDay[];
  initial: { before: string; after: string };
  urls: Readonly<Record<string, string>>;
  decrypting: ReadonlySet<string>;
  ensureDecrypted: (photos: readonly ProgressPhoto[]) => void;
  onClose: () => void;
  /** Null where this device cannot hand an image on. */
  onShare:
    | ((before: ProgressPhoto, after: ProgressPhoto) => Promise<void>)
    | null;
}) {
  const [before, setBefore] = useState(initial.before);
  const [after, setAfter] = useState(initial.after);
  const [pose, setPose] = useState<Pose | null>(null);
  const [sharing, setSharing] = useState(false);

  const beforeDay = days.find((d) => d.date === before);
  const afterDay = days.find((d) => d.date === after);
  const poses =
    beforeDay && afterDay && before !== after
      ? sharedPoses(beforeDay, afterDay)
      : [];
  const activePose = pose && poses.includes(pose) ? pose : (poses[0] ?? null);
  const left = activePose ? beforeDay?.byPose[activePose] : undefined;
  const right = activePose ? afterDay?.byPose[activePose] : undefined;

  useEffect(() => {
    if (open) {
      ensureDecrypted([left, right].filter((p): p is ProgressPhoto => !!p));
    }
  }, [open, left, right, ensureDecrypted]);

  const daySelect = (
    label: string,
    value: string,
    onChange: (date: string) => void
  ) => (
    <label className="block space-y-1.5">
      <SectionLabel as="span">{label}</SectionLabel>
      <select
        className="ds-input min-h-11 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {days.map((d) => (
          <option key={d.date} value={d.date}>
            {dayLabel(d.date)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !sharing) onClose();
      }}
      title="Compare"
      description="Two days side by side, pose against pose."
    >
      <div className="space-y-4 px-5 pb-5 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {daySelect("Before", before, setBefore)}
          {daySelect("After", after, setAfter)}
        </div>

        <SegmentedControl
          ariaLabel="Pose"
          options={POSES.map((p) => ({
            value: p,
            label: POSE_LABELS[p],
            disabled: !poses.includes(p),
          }))}
          value={activePose}
          onChange={setPose}
        />

        {before === after ? (
          <p className="text-sm text-muted-foreground">
            Pick two different days.
          </p>
        ) : !activePose || !left || !right ? (
          <p className="text-sm text-muted-foreground">
            These two days have no pose in common.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                [before, left],
                [after, right],
              ] as const
            ).map(([date, photo]) => (
              <figure key={date} className="space-y-1">
                <ProgressPhotoThumb
                  url={urls[photo.id]}
                  decrypting={decrypting.has(photo.id)}
                  label={POSE_LABELS[photo.pose]}
                />
                <figcaption className="text-center font-mono text-xs tabular-nums text-muted-foreground">
                  {dayLabel(date)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {onShare && left && right && before !== after && (
          <Button
            fullWidth
            leftIcon={<Share2 className="size-4" />}
            loading={sharing}
            onClick={async () => {
              setSharing(true);
              try {
                await onShare(left, right);
              } finally {
                setSharing(false);
              }
            }}
          >
            Share before and after
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
