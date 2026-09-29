/**
 * Progress photos, on Analytics' Body page under the weight chart.
 *
 * Dated sets of front, side and back photos, compared two days at a
 * time. They are private: owner-only in both stores and encrypted on
 * the device before upload. The line under the heading says so the way
 * Soc9 settled it, "never shown to other users" rather than "only you",
 * since Tropos can read both stores. Sharing hands an image to the
 * phone's share sheet; nothing is posted in the app.
 */
import { useEffect, useMemo, useState } from "react";
import { Camera, Lock, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import ProgressPhotoThumb from "./ProgressPhotoThumb";
import ProgressPhotoDaySheet from "./ProgressPhotoDaySheet";
import ProgressPhotoCompareSheet from "./ProgressPhotoCompareSheet";
import { useUid } from "@/lib/auth";
import { useProgressPhotos } from "@/hooks/useProgressPhotos";
import {
  POSES,
  POSE_LABELS,
  defaultComparison,
  type ProgressDay,
  type ProgressPhoto,
} from "@/lib/progressPhotos";
import {
  canShareProgressImages,
  comparisonImage,
  photoImage,
  shareProgressImage,
  type ShareOutcome,
} from "@/lib/progressPhotoShare";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import { track } from "@/lib/historyAnalytics";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { THEME } from "@/lib/theme";

/** Days listed before "Show all". */
const LISTED_DAYS = 4;

const dayLabel = (date: string) => formatDayMonthYear(parseLocalDate(date));

const shownPhotos = (day: ProgressDay): ProgressPhoto[] =>
  POSES.flatMap((pose) => {
    const photo = day.byPose[pose];
    return photo ? [photo] : [];
  });

export default function ProgressPhotos() {
  const uid = useUid();
  // A new account gets a new instance: nothing one account loaded can
  // survive a switch to another.
  return uid ? <AccountProgressPhotos key={uid} uid={uid} /> : null;
}

function AccountProgressPhotos({ uid }: { uid: string }) {
  const {
    loading,
    loadFailed,
    days,
    urls,
    decrypting,
    ensureDecrypted,
    add,
    remove,
    move,
    imageFor,
  } = useProgressPhotos(uid);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [compare, setCompare] = useState<{
    before: string;
    after: string;
    key: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const canShare = useMemo(() => canShareProgressImages(), []);

  const listed = useMemo(
    () => (showAll ? days : days.slice(0, LISTED_DAYS)),
    [days, showAll]
  );
  const listedPhotos = useMemo(() => listed.flatMap(shownPhotos), [listed]);
  useEffect(() => {
    ensureDecrypted(listedPhotos);
  }, [listedPhotos, ensureDecrypted]);

  const sheetDay = sheetDate ? days.find((d) => d.date === sheetDate) : null;
  useEffect(() => {
    if (sheetDay)
      ensureDecrypted([...shownPhotos(sheetDay), ...sheetDay.extras]);
  }, [sheetDay, ensureDecrypted]);

  const report = (outcome: ShareOutcome, shareKind: "photo" | "compare") => {
    if (outcome === "shared" || outcome === "saved") {
      track("history_progress_photo_shared", {
        shareKind,
        shareVia: outcome === "shared" ? "share_sheet" : "download",
      });
    }
    if (outcome === "saved") toast.success("Image saved");
    if (outcome === "failed")
      toast.error("Couldn't share the image. Try again.");
  };

  const sharePhoto = async (photo: ProgressPhoto) => {
    try {
      const image = await photoImage(await imageFor(photo));
      report(
        await shareProgressImage(image, `tropos-progress-${photo.date}.jpg`),
        "photo"
      );
    } catch (err) {
      logger.error("[ProgressPhotos] photo share failed:", err);
      toast.error("Couldn't make the image. Try again.");
    }
  };

  const shareComparison = async (
    before: ProgressPhoto,
    after: ProgressPhoto
  ) => {
    try {
      const [a, b] = await Promise.all([imageFor(before), imageFor(after)]);
      const image = await comparisonImage(
        { image: a, date: before.date },
        { image: b, date: after.date }
      );
      report(
        await shareProgressImage(
          image,
          `tropos-progress-${before.date}-to-${after.date}.jpg`
        ),
        "compare"
      );
    } catch (err) {
      logger.error("[ProgressPhotos] comparison share failed:", err);
      toast.error("Couldn't make the image. Try again.");
    }
  };

  const openDay = (date: string) => {
    haptic("light");
    setSheetDate(date);
  };

  const comparison = defaultComparison(days);
  const compareAction = comparison ? (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        track("history_progress_photos_compared");
        setCompare({ ...comparison, key: Date.now() });
      }}
      className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-lifting-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Compare
    </button>
  ) : undefined;

  return (
    <section
      id="progress-photos"
      aria-label="Progress photos"
      className="space-y-2"
    >
      <SectionHeading action={compareAction}>Progress photos</SectionHeading>
      <Card className="space-y-3">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Private to your account — encrypted on this device before upload and
          never shown to other users.
        </p>

        {loading ? (
          <div
            aria-hidden
            className="h-24 rounded-xl bg-muted motion-safe:animate-pulse"
          />
        ) : days.length === 0 ? (
          loadFailed ? (
            <p className="text-sm text-muted-foreground" role="alert">
              Couldn't load your photos. Check your connection and reopen this
              page.
            </p>
          ) : (
            <EmptyState
              compact
              icon={Camera}
              headline="No photos yet"
              sub="Front, side and back every few weeks show change the scale can miss."
              accent={THEME.brand}
              action={{
                label: "Add photos",
                onClick: () => openDay(localDateString()),
              }}
            />
          )
        ) : (
          <>
            <ul className="space-y-2">
              {listed.map((day) => {
                const photos = shownPhotos(day);
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      aria-label={`${dayLabel(day.date)}, ${photos
                        .map((p) => POSE_LABELS[p.pose].toLowerCase())
                        .join(", ")}`}
                      onClick={() => openDay(day.date)}
                      className="w-full space-y-2 rounded-xl bg-muted p-3 text-left transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="block font-mono text-sm font-semibold tabular-nums text-foreground">
                        {dayLabel(day.date)}
                      </span>
                      <span className="flex gap-2">
                        {photos.map((photo) => (
                          <ProgressPhotoThumb
                            key={photo.id}
                            url={urls[photo.id]}
                            decrypting={decrypting.has(photo.id)}
                            label={POSE_LABELS[photo.pose]}
                            className="w-20"
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!showAll && days.length > LISTED_DAYS && (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setShowAll(true)}
              >
                Show all {days.length} days
              </Button>
            )}
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Plus className="size-4" />}
              onClick={() => openDay(localDateString())}
            >
              Add photos
            </Button>
          </>
        )}
      </Card>

      {sheetDate && (
        <ProgressPhotoDaySheet
          open
          date={sheetDate}
          days={days}
          urls={urls}
          decrypting={decrypting}
          onDateChange={setSheetDate}
          onClose={() => setSheetDate(null)}
          add={add}
          remove={remove}
          move={move}
          onShare={canShare ? sharePhoto : null}
        />
      )}

      {compare && days.length >= 2 && (
        <ProgressPhotoCompareSheet
          key={compare.key}
          open
          days={days}
          initial={compare}
          urls={urls}
          decrypting={decrypting}
          ensureDecrypted={ensureDecrypted}
          onClose={() => setCompare(null)}
          onShare={canShare ? shareComparison : null}
        />
      )}
    </section>
  );
}
