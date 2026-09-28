import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  Navigation,
  Share2,
  Bookmark,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import { applyPrivacyZones } from "@/lib/privacyZones";
import { useShareRoute } from "@/hooks/useShareRoute";
import { useSavedRoutes } from "@/hooks/useSavedRoutes";
import { toast } from "@/lib/toast";
import {
  describeRouteConfidence,
  type RouteQuality,
} from "../lib/routeQuality";
import { useAuth } from "../lib/auth";
import { THEME } from "../lib/theme";
import { isOutdoorGpsRun } from "../lib/runGuards";
import { gradeAdjustedPace } from "../lib/gradeAdjustedPace";
import RunMap from "../components/run/RunMapLazy";
import PaceLegend from "../components/run/PaceLegend";
import SplitsBarChart from "../components/analytics/SplitsBarChart";
import ElevationProfile from "../components/analytics/ElevationProfile";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import DeleteSessionAction from "@/components/session/DeleteSessionAction";
import SessionLoadState from "@/components/session/SessionLoadState";
import { useSessionDoc } from "@/hooks/useSessionDoc";
import { distanceLabel, distanceValue, paceMinSec } from "@/lib/runLabels";
import {
  distanceUnitLabel,
  elevationUnitLabel,
  paceUnitLabel,
} from "@/lib/distanceUnits";
import RunStatGrid from "@/components/run/RunStatGrid";
import { splitsForDisplay } from "@/lib/gps";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { elevationLabel, runTypeTitle } from "@/lib/runLabels";

export default function RunDetail() {
  const unit = useDistanceUnit();
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const shareRouteWithPrivacy = useShareRoute();
  const privacy = usePrivacyZones();
  const { save: saveRoute } = useSavedRoutes();
  const {
    status: runStatus,
    data: run,
    retry: retryRun,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useSessionDoc<Record<string, any> & { id: string }>(
    user?.uid,
    "runs",
    runId
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const replayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sharedPoints = useMemo(
    () =>
      privacy.loading || privacy.error
        ? []
        : applyPrivacyZones(run?.points ?? [], privacy.zones),
    [run?.points, privacy.loading, privacy.error, privacy.zones]
  );

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

  /* Three states, three different words and actions. A single `!run`
     check cannot tell them apart — it renders one spinner for a run that
     is still arriving, one that was deleted and one the network failed to
     fetch, and the last two never stop. Retry belongs only on `failed`:
     on a deleted run it is a control that can never succeed. */
  if (runStatus !== "ready" || !run)
    return (
      <SessionLoadState
        status={runStatus}
        icon={Navigation}
        loadingLabel="Loading run"
        missingHeadline="Run not found"
        missingSub="It may have been deleted, or the link belongs to another account."
        failedHeadline="Couldn't load this run"
        failedSub="Check your connection and try again. Nothing has been changed."
        onRetry={retryRun}
        backHref="/history"
        backLabel="History"
      />
    );

  const avgPace =
    run.duration > 0 && run.distance > 0
      ? (run.duration / run.distance) * 1000
      : 0;

  // Splits are per-kilometre segments derived from the GPS trace
  // (`calculateSplits` in lib/gps.ts — needs ≥2 points and at least one full
  // km). A run legitimately has zero in three cases, so instead of a raw "0"
  // the tile explains the actual reason: no GPS trace at all (treadmill /
  // "track without GPS" manual runs), a run under 1 km (no km boundary
  // crossed), or GPS present but no split data recorded.
  /* Mile laps are a different CUT of the run, recomputed from the trace —
     see splitsForDisplay for the no-trace fallback. */
  const { splits: displaySplits, lapUnit } = splitsForDisplay(
    unit,
    run.points,
    run.splits
  );
  const splitCount = displaySplits.length;
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
      ? `Under ${distanceUnitLabel(unit) === "mi" ? "a mile" : "1 km"}`
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
    const label = runTypeTitle(run.activityType);
    shareRouteWithPrivacy(
      `${label} · ${distanceLabel(run.distance, unit)}`,
      run.points
    );
  };

  // Save this run's trace as a reusable favourite (source "run") — the
  // "save/reuse" half of route planning v1. Same store the planner and GPX
  // import write to; it then appears under Saved routes in run setup.
  const saveThisRoute = async () => {
    const label = runTypeTitle(run.activityType);
    const ok = await saveRoute({
      name: `${label} · ${distanceLabel(run.distance, unit)}`,
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
        <div className="relative h-80">
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
                className="mt-0.5 shrink-0 text-warning-strong"
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

        {/* Header (DS3): the run's type, then the distance as the page's
            one big number, then when. */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-running-strong">
                {runTypeTitle(run.activityType)}
              </p>
              <h1 className="mt-1 text-display font-extrabold font-mono tabular-nums leading-none text-foreground">
                {distanceValue(run.distance, unit, 2)}{" "}
                <span className="font-sans text-h3 font-bold text-muted-foreground">
                  {distanceUnitLabel(unit)}
                </span>
              </h1>
            </div>
            {/* The `sport-tinted` variant, not a hand-copy of it. This was
                a raw <button> reproducing the variant a shade off —
                `bg-running/8` where the token is `/10`, `text-xs` where
                the primitive is `text-sm` — with a literal "↗" glyph
                standing in for an icon. */}
            <Button
              variant="sport-tinted"
              onClick={handleShare}
              leftIcon={<Share2 className="size-4" aria-hidden="true" />}
            >
              Share
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{dateStr}</p>
        </div>

        <RunStatGrid
          stats={[
            { label: "Time", value: formatTime(run.duration) },
            {
              label: "Average pace",
              value: paceMinSec(avgPace, unit),
              unit: paceUnitLabel(unit),
            },
            {
              label: "Elevation gain",
              value: elevationLabel(run.elevationGain ?? 0, unit, false),
              unit: elevationUnitLabel(unit),
            },
            {
              label: "Calories",
              value: `${run.calories ?? 0}`,
              unit: "kcal",
            },
          ]}
        />

        {/* No splits: say why, once, where the split bars would be.
            Splits are per-kilometre (or per-mile) segments of the GPS
            trace; a run has none without a trace, under one lap, or when
            the trace recorded none. */}
        {splitCount === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Splits · {splitsEmptyReason}
          </p>
        )}

        {/* Grade-adjusted pace — one calm line, only when the climb was
            material (Run13 item 4, display-only; never feeds trends/PRs). */}
        {gap && (
          <p className="text-center text-xs text-muted-foreground">
            Grade-adjusted pace{" "}
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {paceMinSec(gap.gapSecondsPerKm, unit)}
            </span>
            {paceUnitLabel(unit)} — flat-equivalent for this climb
          </p>
        )}

        {/* Splits chart */}
        {displaySplits.length > 0 && (
          <SplitsBarChart
            splits={displaySplits}
            avgPaceSeconds={avgPace}
            accentColor={THEME.running}
            lapUnit={lapUnit}
          />
        )}

        {/* Elevation profile */}
        {run.points?.length > 0 && (
          <ElevationProfile points={run.points} accentColor={THEME.running} />
        )}

        {/* Run this route again (follow its GPS line), save it as a
            reusable favourite, or export the .gpx. Only when there's a
            real trace. DS3: after the run's own numbers and charts, since
            the page is for reading the run; "Run this route again" is the
            one full-width action and the two utilities pair beneath it
            (three-up left "Save route" wrapping at 393px). "Export GPX",
            not "Share": the header's Share makes a picture card, this
            hands over a .gpx file. */}
        {hasGpsTrace && (
          <div className="space-y-2">
            <Button
              variant="sport"
              size="lg"
              fullWidth
              leftIcon={<Repeat className="size-4" aria-hidden="true" />}
              onClick={() =>
                navigate("/run", { state: { followRoute: run.points } })
              }
            >
              Run this route again
            </Button>
            <div className="flex gap-2">
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
                Export GPX
              </Button>
            </div>
          </div>
        )}

        {/* ADR-0012. Last on the page and behind a confirm: a records
            correction for a mis-log, not a primary action. A phone-in-
            pocket accidental "run" is the case this exists for. */}
        {user && runId && (
          <DeleteSessionAction
            uid={user.uid}
            kind="run"
            id={runId}
            /* Runs shared since the delete-link fix carry this; older
               shared runs read null and get the honest "post stays"
               copy. */
            sharedActivityId={(run?.sharedActivityId as string) ?? null}
          />
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
          points: sharedPoints,
          distanceKm: run.distance / 1000,
          durationSec: run.duration,
          paceSecPerKm: avgPace,
          elevationM: run.elevationGain ?? undefined,
          /* The card's rows follow the same recut-not-relabel rule as the
             chart above it — `displaySplits` is already in the sharer's
             unit, and `paceSeconds` is sec/km either way. */
          splits: displaySplits.map((s) => ({
            lap: s.km,
            paceSecPerKm: s.paceSeconds,
          })),
        }}
      />
    </div>
  );
}
