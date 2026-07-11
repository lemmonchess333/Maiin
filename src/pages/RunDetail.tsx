import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import {
  Info,
  AlertTriangle,
  Navigation,
  Share2,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useShareRoute } from "@/hooks/useShareRoute";
import { useSavedRoutes } from "@/hooks/useSavedRoutes";
import { toast } from "@/lib/toast";
import {
  describeRouteConfidence,
  type RouteQuality,
} from "../lib/routeQuality";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { THEME } from "../lib/theme";
import { isOutdoorGpsRun } from "../lib/runGuards";
import {
  formatSecondsPerKm,
  gradeAdjustedPace,
} from "../lib/gradeAdjustedPace";
import RunMap from "../components/run/RunMapLazy";
import PaceLegend from "../components/run/PaceLegend";
import SplitsBarChart from "../components/analytics/SplitsBarChart";
import ElevationProfile from "../components/analytics/ElevationProfile";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { Spinner } from "../components/ui/Spinner";

const ACTIVITY_LABELS: Record<string, string> = {
  freerun: "Free Run",
  easy: "Easy Run",
  tempo: "Tempo Run",
  intervals: "Intervals",
  longrun: "Long Run",
  race: "Race",
  treadmill: "Treadmill",
  /* 'manual' = "Track without GPS" path. Outdoor user, GPS never
     locked. Distinguished from treadmill so the detail header reads
     honestly. */
  manual: "Manual Run",
};

function StatPill({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex-1 text-center py-3 px-2">
      <p
        className="text-2xl font-bold font-mono tabular-nums leading-none"
        style={{ color: color || "var(--foreground)" }}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  );
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const shareRouteWithPrivacy = useShareRoute();
  const { save: saveRoute } = useSavedRoutes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [run, setRun] = useState<Record<string, any> | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const replayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || !runId) return;
    getDoc(doc(db, "users", user.uid, "runs", runId)).then((snap) => {
      if (snap.exists()) setRun({ id: snap.id, ...snap.data() });
    });
  }, [user, runId]);

  const startReplay = useCallback(() => {
    if (!run?.points?.length) return;
    if (replayRef.current) clearInterval(replayRef.current);
    setReplayIndex(0);
    setReplaying(true);
    const step = Math.max(1, Math.ceil(run.points.length / 60));
    replayRef.current = setInterval(() => {
      setReplayIndex((prev: number) => {
        const next = prev + step;
        if (next >= run.points.length - 1) {
          clearInterval(replayRef.current!);
          replayRef.current = null;
          setTimeout(() => setReplaying(false), 600);
          return run.points.length - 1;
        }
        return next;
      });
    }, 50);
  }, [run]);

  // Cleanup replay interval
  useEffect(() => {
    return () => {
      if (replayRef.current) clearInterval(replayRef.current);
    };
  }, []);

  if (!run)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" variant="primary" label="Loading run" />
      </div>
    );

  const avgPace =
    run.duration > 0 && run.distance > 0
      ? (run.duration / run.distance) * 1000
      : 0;
  const avgPaceStr =
    avgPace > 0
      ? `${Math.floor(avgPace / 60)}:${(Math.floor(avgPace) % 60).toString().padStart(2, "0")}`
      : "--:--";

  // Splits are per-kilometre segments derived from the GPS trace
  // (`calculateSplits` in lib/gps.ts — needs ≥2 points and at least one full
  // km). A run legitimately has zero in three cases, so instead of a raw "0"
  // the tile explains the actual reason: no GPS trace at all (treadmill /
  // "track without GPS" manual runs), a run under 1 km (no km boundary
  // crossed), or GPS present but no split data recorded.
  const splitCount = run.splits?.length ?? 0;
  const hasGpsTrace = (run.points?.length ?? 0) > 1;

  /* Run13 item 4 — grade-adjusted pace, DISPLAY-ONLY. Outdoor GPS runs
     with material climb (≥8 m/km, gated in the module) get one calm
     flat-equivalent line under the stat tiles; treadmill / manual runs
     have no real elevation signal. Legacy runs without an activityType
     pass the outdoor guard (existing convention) but gate out on a
     missing elevationGain. Feeds nothing — trends / PRs stay raw. */
  const gap = isOutdoorGpsRun(run.activityType)
    ? gradeAdjustedPace({
        distanceMeters: run.distance ?? 0,
        durationSeconds: run.duration ?? 0,
        elevationGainMeters: run.elevationGain ?? 0,
      })
    : null;
  const splitsEmptyReason = !hasGpsTrace
    ? "No GPS route"
    : run.distance < 1000
      ? "Under 1 km"
      : "No splits yet";

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const date = run.completedAt?.toDate?.();
  const dateStr =
    date?.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }) ?? "";

  const handleShare = () => {
    setShareOpen(true);
  };

  const shareThisRoute = () => {
    const label = ACTIVITY_LABELS[run.activityType] ?? "Run";
    shareRouteWithPrivacy(
      `${label} · ${(run.distance / 1000).toFixed(1)} km`,
      run.points
    );
  };

  // Save this run's trace as a reusable favourite (source "run") — the
  // "save/reuse" half of route planning v1. Same store the planner and GPX
  // import write to; it then appears under Saved routes in run setup.
  const saveThisRoute = async () => {
    const label = ACTIVITY_LABELS[run.activityType] ?? "Run";
    const ok = await saveRoute({
      name: `${label} · ${(run.distance / 1000).toFixed(1)} km`,
      points: run.points,
      source: "run",
    });
    toast[ok ? "success" : "error"](
      ok ? "Route saved — find it in run setup" : "Couldn't save route"
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Map — full bleed, tall */}
      {run.points?.length > 1 ? (
        <div className="relative h-72">
          <RunMap
            points={run.points}
            currentPoint={null}
            interactive={true}
            height="h-full"
            paceColored={true}
            avgPaceSecPerKm={avgPace}
            darkMode={!!profile?.darkMode}
            replayIndex={replaying ? replayIndex : undefined}
          />
          {/* Back button over map */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="absolute top-4 left-4 size-11 rounded-full flex items-center justify-center backdrop-blur-md z-10"
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          {/* Replay button */}
          <button
            type="button"
            onClick={startReplay}
            disabled={replaying}
            className="absolute bottom-3 right-3 inline-flex items-center px-3 min-h-[44px] rounded-lg text-xs font-medium backdrop-blur-md z-10 disabled:opacity-50"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {replaying ? "▶ Replaying…" : "▶ Replay"}
          </button>
        </div>
      ) : (
        /* No map — show back button inline */
        <div className="flex items-center gap-3 px-4 pt-12 pb-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="size-11 rounded-full flex items-center justify-center bg-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Pace legend — its own strip BELOW the map. Previously it was the
          last child INSIDE the fixed `h-72` map container, so it overflowed
          the bottom of that box and collided with the header section's
          "FREE RUN" label + Share pill at 393px (audit #3a/#3b). Only shown
          with a pace-coloured map (points > 1). */}
      {run.points?.length > 1 && <PaceLegend />}

      <div className="px-4 pt-4 space-y-4">
        {/* Saved-anyway notice. Surfaces only when the run was
            persisted with `isInvalid: true` (PR #480 metadata). The
            user already saw InvalidRunReview at save time and chose
            to keep the record — this banner is a historical
            reminder so when they revisit a 0.00km / 0:02 entry they
            know why it looks weird. Calm informational tone (muted
            card, Info icon, not red/alarm) — these are records the
            user deliberately kept, not warnings. Reason-aware body
            mirrors the wording from InvalidRunReview to keep the
            saved-state and historical-view voices consistent.
            P0.5 stat hygiene already excludes these from totals,
            so the banner is honest: the run is here, but it doesn't
            count toward stats. */}
        {/* PR H (audit P1 #9): route-quality chip. Surfaces only when
            the saved quality is patchy / poor — "good" runs stay
            quiet so the chip doesn't become noise on the 95% of
            healthy outdoor runs. Honest tone: tells the user the
            trace isn't authoritative without implying they didn't
            actually run. */}
        {run.routeQuality &&
          (run.routeQuality as RouteQuality).confidence !== "good" && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-bg border border-warning/15">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {describeRouteConfidence(
                    (run.routeQuality as RouteQuality).confidence
                  )}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {(run.routeQuality as RouteQuality).backgroundGapMs > 60_000
                    ? `App was backgrounded for ${Math.round((run.routeQuality as RouteQuality).backgroundGapMs / 1000)}s during this run. Keep Tropos open during outdoor runs for the most accurate route.`
                    : "GPS signal was noisy or intermittent. Distance and pace estimates are approximate."}
                </p>
              </div>
            </div>
          )}

        {run.isInvalid && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/60 border border-border">
            <Info
              size={16}
              className="mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                Saved despite invalid metrics
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {run.invalidReason === "too-fast"
                  ? "We saved this despite an unrealistic implied pace. Distance and time may not reflect a real run. Excluded from your weekly totals and stats."
                  : "We saved this despite being below the minimum distance or duration for a normal summary. Excluded from your weekly totals and stats."}
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">
                {ACTIVITY_LABELS[run.activityType] ?? "Run"}
              </p>
              <h1 className="text-xl font-extrabold text-foreground font-mono tabular-nums">
                {(run.distance / 1000).toFixed(2)} km
              </h1>
            </div>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-medium active:scale-[0.97] transition-transform bg-running/8 text-running"
            >
              ↗ Share
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{dateStr}</p>
        </div>

        {/* Primary stats row */}
        <div className="rounded-2xl bg-card card-shadow flex divide-x divide-border/40">
          <StatPill value={formatTime(run.duration)} label="Time" />
          <StatPill value={avgPaceStr} label="/km Pace" color={THEME.teal} />
          <StatPill
            value={`${run.calories ?? 0}`}
            label="Cal"
            color={THEME.warning}
          />
        </div>

        {/* Re-run this route (follow its GPS line) + Share route (.gpx via the
            native share sheet). Distinct from the header "Share" which shares a
            visual card image. Only when there's a real trace. */}
        {hasGpsTrace && (
          <div className="flex gap-2">
            <Button
              variant="sport-tinted"
              className="flex-1"
              onClick={() =>
                navigate("/run", { state: { followRoute: run.points } })
              }
            >
              <Navigation className="size-4" aria-hidden="true" />
              Re-run
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => void saveThisRoute()}
            >
              <Bookmark className="size-4" aria-hidden="true" />
              Save route
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => shareThisRoute()}
            >
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </Button>
          </div>
        )}

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-card text-center card-shadow">
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {run.elevationGain ?? 0}m
            </p>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mt-0.5">
              Elevation Gain
            </p>
          </div>
          <div className="p-3 rounded-xl bg-card text-center card-shadow flex flex-col justify-center">
            {splitCount > 0 ? (
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {splitCount}
              </p>
            ) : (
              /* Empty splits: one muted explanatory line in place of a raw
                 "0", matching the real reason (audit #6.5). */
              <p className="text-sm text-muted-foreground leading-snug px-1">
                {splitsEmptyReason}
              </p>
            )}
            <p className="text-xs uppercase tracking-widest text-muted-foreground mt-0.5">
              Splits
            </p>
          </div>
        </div>

        {/* Grade-adjusted pace — one calm line, only when the climb was
            material (Run13 item 4, display-only; never feeds trends/PRs). */}
        {gap && (
          <p className="text-center text-xs text-muted-foreground">
            Grade-adjusted pace{" "}
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {formatSecondsPerKm(gap.gapSecondsPerKm)}
            </span>
            /km — flat-equivalent for this climb
          </p>
        )}

        {/* Splits chart */}
        {run.splits?.length > 0 && (
          <SplitsBarChart
            splits={run.splits}
            avgPaceSeconds={avgPace}
            accentColor={THEME.teal}
          />
        )}

        {/* Elevation profile */}
        {run.points?.length > 0 && (
          <ElevationProfile points={run.points} accentColor={THEME.running} />
        )}
      </div>

      {/* S1 share-card system — customization sheet + new renderer */}
      <ShareCardSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        data={{
          template: "run",
          handle: profile?.displayName ?? "Athlete",
          date:
            date?.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }) ?? "",
          points: run.points,
          distanceKm: run.distance / 1000,
          durationSec: run.duration,
          pace: avgPaceStr,
          elevationM: run.elevationGain ?? undefined,
          splits: (run.splits ?? []).map((s: { km: number; pace: string }) => ({
            km: s.km,
            pace: s.pace,
          })),
        }}
      />
    </div>
  );
}
