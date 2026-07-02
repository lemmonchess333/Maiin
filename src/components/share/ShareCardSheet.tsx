import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Share2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { track } from "@/lib/socialAnalytics";
import { generateShareImage, shareImageFile } from "@/lib/shareCardGenerator";
import { shareToInstagramStories } from "@/lib/shareCard/instagramShare";
import { buildRoutePath } from "@/lib/shareCard/polyline";
import {
  TOGGLEABLE_STATS,
  toggleStat,
  visibleStatCount,
} from "@/lib/shareCard/statToggles";
import ShareCardRenderer, {
  type ShareTemplate,
  type ShareFormat,
  type ShareBackground,
  type ShareCardRenderData,
} from "@/components/share/ShareCardRenderer";
import type { GPSPoint } from "@/lib/gps";

/**
 * ShareCardSheet (SOCIAL S1, PR3) — the customization + export surface.
 *
 * Wraps ShareCardRenderer behind a bottom sheet: a scaled live preview, a
 * format toggle (Story / Square), a background picker (Brand / Dark /
 * Transparent), per-stat eye toggles, and Export. A second copy of the
 * renderer is mounted offscreen at full 1080-px size as the rasterisation
 * source; html-to-image captures THAT, not the scaled preview.
 *
 * Privacy default: the route polyline is end-clipped (the abstract line,
 * never a map) — buildRoutePath(clip: true). Photo mode + route-on-map
 * opt-in land in a follow-up; the abstract clipped line is the spec's
 * preferred default anyway.
 *
 * Funnel: `share_card_opened` on open, `share_card_exported`
 * (template/format/background/outcome) on export.
 */

type StatLabels = Record<string, string>;

export interface ShareCardSheetData {
  template: ShareTemplate;
  handle: string;
  date: string;
  // RUN
  points?: GPSPoint[];
  distanceKm?: number;
  durationSec?: number;
  pace?: string;
  elevationM?: number;
  splits?: { km: number; pace: string }[];
  // LIFT
  totalVolumeKg?: number;
  exerciseCount?: number;
  prCount?: number;
  prExercise?: string;
  // NUTRITION
  calories?: number;
  calorieTarget?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  // RECAP (weekly summary — distanceKm/totalVolumeKg carry WEEK totals)
  sessionsCount?: number;
  streakDays?: number;
}

const STAT_LABELS: StatLabels = {
  distance: "Distance",
  duration: "Time",
  pace: "Pace",
  splits: "Splits",
  elevation: "Elev",
  volume: "Volume",
  exercises: "Exercises",
  prs: "PRs",
  liftVolume: "Lift",
  runDistance: "Run",
  totalTime: "Time",
  calories: "Calories",
  macros: "Macros",
  sessions: "Sessions",
  streak: "Streak",
};

/** Stats with no data for this run/session aren't offered as toggles. */
function statHasData(key: string, data: ShareCardSheetData): boolean {
  switch (key) {
    case "elevation":
      return data.elevationM != null;
    case "splits":
      return (data.splits?.length ?? 0) > 0;
    case "prs":
      return (data.prCount ?? 0) > 0;
    case "streak":
      return (data.streakDays ?? 0) > 0;
    default:
      return true;
  }
}

export function ShareCardSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShareCardSheetData;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [background, setBackground] = useState<ShareBackground>("brand");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo background: read the picked image as a data URL. A same-origin
  // data: URI rasterises cleanly (no cross-origin canvas taint, unlike a
  // remote map tile), and a <input type=file accept=image/*> opens the
  // photo library in both the browser and the iOS WKWebView — no
  // Capacitor Camera plugin needed.
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(reader.result as string);
      setBackground("photo");
    };
    reader.readAsDataURL(file);
  };

  const onBackgroundChange = (bg: ShareBackground) => {
    // "Photo" first opens the picker; we only switch to photo mode once a
    // file is chosen (a cancelled picker leaves the current background).
    if (bg === "photo") {
      fileInputRef.current?.click();
      return;
    }
    setBackground(bg);
  };

  // Top of the funnel — once per open.
  useEffect(() => {
    if (open) track("share_card_opened", { template: data.template });
  }, [open, data.template]);

  // Abstract route polyline (privacy-clipped) — RUN only, when GPS exists.
  const routePath = useMemo(() => {
    if (data.template !== "run" || !data.points || data.points.length < 2) {
      return undefined;
    }
    const { d } = buildRoutePath(data.points, { clip: true });
    return d || undefined;
  }, [data.template, data.points]);

  const renderData: ShareCardRenderData = {
    template: data.template,
    format,
    background,
    handle: data.handle,
    date: data.date,
    hiddenStats: hidden,
    photoUrl,
    routePath,
    distanceKm: data.distanceKm,
    durationSec: data.durationSec,
    pace: data.pace,
    elevationM: data.elevationM,
    splits: data.splits,
    totalVolumeKg: data.totalVolumeKg,
    exerciseCount: data.exerciseCount,
    prCount: data.prCount,
    prExercise: data.prExercise,
    calories: data.calories,
    calorieTarget: data.calorieTarget,
    protein: data.protein,
    carbs: data.carbs,
    fat: data.fat,
    sessionsCount: data.sessionsCount,
    streakDays: data.streakDays,
  };

  const toggleKeys = TOGGLEABLE_STATS[data.template].filter((k) =>
    statHasData(k, data)
  );

  const previewW = 240;
  const cardW = 1080;
  const cardH = format === "story" ? 1920 : 1080;
  const scale = previewW / cardW;

  const handleToggle = (key: string) => {
    // Don't let the user hide the last visible stat (card would be empty).
    if (!hidden.has(key) && visibleStatCount(data.template, hidden) <= 1)
      return;
    haptic();
    setHidden((h) => toggleStat(h, key));
  };

  const handleExport = async () => {
    if (!captureRef.current || exporting) return;
    setExporting(true);
    haptic();
    try {
      const file = await generateShareImage(captureRef.current, {
        format,
        background,
      });
      if (!file) {
        toast.error("Couldn't create the share image. Try again.");
        track("share_card_exported", {
          template: data.template,
          format,
          background,
          outcome: "failed",
        });
        return;
      }
      // S2: try a direct Instagram-Stories handoff first (native only —
      // the seam returns false on web / before the plugin lands), then
      // fall back to the generic OS share sheet.
      const toIg = await shareToInstagramStories({
        file,
        asTransparentSticker: background === "transparent",
      });
      if (toIg) {
        track("share_card_exported", {
          template: data.template,
          format,
          background,
          destination: "instagram",
          outcome: "shared",
        });
        onOpenChange(false);
        return;
      }
      const outcome = await shareImageFile(
        file,
        `My ${data.template} on Tropos`
      );
      track("share_card_exported", {
        template: data.template,
        format,
        background,
        destination: "sheet",
        outcome,
      });
      if (outcome === "shared" || outcome === "downloaded") {
        onOpenChange(false);
      } else if (outcome === "failed") {
        toast.error("Couldn't share. Try again.");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Share">
      <div className="px-4 pb-6 space-y-4">
        {/* Scaled live preview (the offscreen capture node is separate) */}
        <div className="flex justify-center">
          <div
            className="rounded-2xl overflow-hidden shadow-card"
            style={{ width: previewW, height: cardH * scale }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: cardW,
                height: cardH,
              }}
            >
              <ShareCardRenderer data={renderData} offscreen={false} />
            </div>
          </div>
        </div>

        {/* Format */}
        <SegmentedControl
          ariaLabel="Share format"
          value={format}
          onChange={(v) => setFormat(v as ShareFormat)}
          options={[
            { value: "story", label: "Story" },
            { value: "square", label: "Square" },
          ]}
        />

        {/* Background */}
        <SegmentedControl
          ariaLabel="Card background"
          value={background}
          onChange={(v) => onBackgroundChange(v as ShareBackground)}
          options={[
            { value: "brand", label: "Brand" },
            { value: "dark", label: "Dark" },
            { value: "transparent", label: "Clear" },
            { value: "photo", label: "Photo" },
          ]}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden="true"
          onChange={onPickPhoto}
        />

        {/* Per-stat eye toggles */}
        {toggleKeys.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {toggleKeys.map((key) => {
              const visible = !hidden.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleToggle(key)}
                  aria-pressed={visible}
                  className={`flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-medium transition-colors ${
                    visible
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {visible ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                  {STAT_LABELS[key] ?? key}
                </button>
              );
            })}
          </div>
        )}

        <Button
          variant={data.template === "run" ? "sport" : "primary"}
          fullWidth
          loading={exporting}
          onClick={handleExport}
          leftIcon={<Share2 className="size-4" />}
        >
          {exporting ? "Preparing…" : "Share"}
        </Button>
      </div>

      {/* Offscreen full-size rasterisation source */}
      <ShareCardRenderer data={renderData} ref={captureRef} offscreen />
    </BottomSheet>
  );
}

export default ShareCardSheet;
