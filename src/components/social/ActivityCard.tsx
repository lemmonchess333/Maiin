import { useState, memo } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { giveHighFive, getKudosList, blockUser } from "../../lib/socialApi";
import { useBlockedUsers } from "../../hooks/useBlockedUsers";
import {
  activityExercisesToRoutine,
  type SavedRoutineExercise,
} from "../../lib/savedRoutines";
import { formatExerciseSummary } from "../../lib/exerciseSummary";
import { EXERCISES } from "../../lib/exercises";
import { movementCategoryLabel } from "../../lib/exerciseMovementCategory";
import CommentSheet from "./CommentSheet";
import SaveRoutineSheet from "./SaveRoutineSheet";
import ExerciseCompareSheet from "./ExerciseCompareSheet";
import ReportModal from "./ReportModal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { FeedItem } from "../../hooks/useSocialFeed";
import { THEME } from "../../lib/theme";
import Avatar from "../Avatar";
import BlockAwareAvatar from "./BlockAwareAvatar";
import { haptic } from "../../lib/haptic";
import {
  MessageCircle,
  Flame,
  Footprints,
  Dumbbell,
  Trophy,
  Mountain,
  Share2,
  Target,
  Star,
  MoreHorizontal,
  Flag,
  Ban,
  BookmarkPlus,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { getTimeAgo } from "../../lib/timeAgo";
import { Spinner } from "../ui/Spinner";
import { IconButton } from "../ui/IconButton";

function MiniRoute({ preview }: { preview: { lat: number; lon: number }[] }) {
  const lats = preview.map((p) => p.lat);
  const lons = preview.map((p) => p.lon);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const minLon = Math.min(...lons),
    maxLon = Math.max(...lons);
  const rLat = maxLat - minLat || 0.001;
  const rLon = maxLon - minLon || 0.001;
  const pts = preview
    .map(
      (p) =>
        `${((p.lon - minLon) / rLon) * 188 + 6},${(1 - (p.lat - minLat) / rLat) * 68 + 6}`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 200 80"
      className="size-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Run route map"
    >
      <polyline
        fill="none"
        stroke={THEME.running}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const RUN_CHIPS = ["Nice run!", "Great pace!", "Keep it up!"];
const LIFT_CHIPS = ["Great lift!", "Beast mode!", "Strong work!"];

interface ActivityCardProps {
  feedItem: FeedItem;
  onShare?: (item: FeedItem) => void;
  /** Which feed surfaced this card. Drives the "From your crew" trust
   *  chip — only shown on Explore (Following posts are by definition
   *  from people the user already chose, so the chip would be noise). */
  feedSource?: "following" | "explore";
}

function ActivityCard({ feedItem, onShare, feedSource }: ActivityCardProps) {
  const { user, profile } = useAuth();
  const { addBlocked } = useBlockedUsers();
  const [liked, setLiked] = useState(feedItem.liked ?? false);
  const [kudosCount, setKudosCount] = useState(feedItem.kudosCount ?? 0);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [flameAnimating, setFlameAnimating] = useState(false);
  const [showKudosList, setShowKudosList] = useState(false);
  const [kudosUsers, setKudosUsers] = useState<
    { userId: string; userName: string; photoURL?: string }[]
  >([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showSaveRoutine, setShowSaveRoutine] = useState(false);
  const [compareTarget, setCompareTarget] = useState<{
    name: string;
    summary: string;
    setCount: number;
    targetReps: number;
    targetWeightKg: number;
  } | null>(null);
  const activity = feedItem.activity;

  /* "From your crew" trust chip.
     The audit asked for ranking-driven "Why this post" chips on
     Explore (e.g. "From your crew" / "Similar workout type" / "Popular
     near you"). Without a real ranking signal those become decorative
     lies, so this ships only the one variant where the data is
     unambiguous: the activity was posted by a member of the same crew
     the current user is in. activity.crewId is set at post time by
     the share chain when the author was in a crew (socialApi.postActivity).
     Following posts are by definition chosen by the user — the chip
     would be redundant — so it's gated to feedSource === 'explore'. */
  const fromYourCrew =
    feedSource === "explore" &&
    !!profile?.crewId &&
    !!activity?.crewId &&
    activity.crewId === profile.crewId &&
    feedItem.authorId !== user?.uid;

  /* "Save as routine" gate.
     - Only workout activities (runs aren't routines).
     - Only when the activity has the structured PR-4 exercise payload —
       activities posted before that ship had `{ name, summary }` only,
       which can't reliably be reconstructed into a runnable routine.
     Self-author is intentionally NOT excluded: bookmarking your own
     past workout to re-run it later is a primary use case (lightweight
     programming via the feed), not a footgun. */
  const rawExercises = activity?.exercises as unknown[] | undefined;
  const hasStructuredExercises =
    Array.isArray(rawExercises) &&
    rawExercises.length > 0 &&
    typeof (rawExercises[0] as { setCount?: unknown }).setCount === "number";
  const canSaveRoutine = feedItem.type === "workout" && hasStructuredExercises;
  const routineExercises: SavedRoutineExercise[] = canSaveRoutine
    ? activityExercisesToRoutine(rawExercises)
    : [];

  const activityTitle = (activity?.activityTitle ||
    activity?.workoutName ||
    activity?.runName) as string | undefined;
  const isRun = feedItem.type === "run";
  const isHybrid = !!(
    activity?.routePreview &&
    (activity.routePreview as { lat: number; lon: number }[]).length > 1 &&
    activity?.exercises &&
    (activity.exercises as unknown[]).length > 0
  );

  const handleHighFive = async () => {
    if (!user || liked) return; // One-way — can't undo
    // Optimistic UI
    setLiked(true);
    setKudosCount((c) => c + 1);
    // Animate
    setFlameAnimating(true);
    setTimeout(() => setFlameAnimating(false), 200);
    haptic("light");

    try {
      // 2026-05-26 audit PR 3 (finding #6) — kudos notification is
      // now written server-side inside `toggleKudosCallable`, so the
      // client no longer makes a separate /notifications/* write.
      // The CF receives the `fromName` from this call's payload via
      // `giveHighFive` (which forwards it through the callable).
      await giveHighFive(feedItem.activityId, user.uid, {
        fromName: profile?.displayName || "Someone",
      });
    } catch {
      // Network / auth failure — revert the optimistic flip so the
      // UI reflects the server truth. Error haptic signals the bounce.
      setLiked(false);
      setKudosCount((c) => Math.max(0, c - 1));
      haptic("error");
    }
  };

  const [kudosLoading, setKudosLoading] = useState(false);

  const handleShowKudosList = async () => {
    if (showKudosList) {
      setShowKudosList(false);
      return;
    }
    setShowKudosList(true);
    setKudosLoading(true);
    try {
      const users = await getKudosList(feedItem.activityId);
      setKudosUsers(users);
    } catch {
      // Fetch failed — render an empty list and clear loading so the
      // popup doesn't hang on a spinner forever. Popup can be
      // re-opened to retry.
      setKudosUsers([]);
    } finally {
      setKudosLoading(false);
    }
  };

  const createdAtObj = feedItem.createdAt as
    | { toDate?: () => Date }
    | undefined;
  const timeAgo = createdAtObj?.toDate ? getTimeAgo(createdAtObj.toDate()) : "";
  // DS1b: these stay inline — they're passed as `fallbackBg`/`fallbackColor`
  // string PROPS to <Avatar/>, not applied as classes here, so there's no
  // className form to migrate to.
  const avatarBg = isRun ? `${THEME.running}20` : `${THEME.lifting}20`;
  const avatarColor = isRun ? THEME.running : THEME.lifting;
  const chips = isRun ? RUN_CHIPS : LIFT_CHIPS;

  const exercises = activity?.exercises as
    | Array<{
        name: string;
        summary: string;
        setCount?: number;
        targetReps?: number;
        targetWeightKg?: number;
      }>
    | undefined;
  const prCount = activity?.prCount as number | undefined;

  // Render run content (map + stats)
  const renderRunContent = (mapHeight = "h-28") => (
    <>
      {activity?.routePreview &&
        (activity.routePreview as { lat: number; lon: number }[]).length >
          1 && (
          <div
            className={`${mapHeight} border-b border-border/50`}
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <MiniRoute
              preview={activity.routePreview as { lat: number; lon: number }[]}
            />
          </div>
        )}
      {activity && (
        <div className="flex gap-5 p-4 pb-0">
          <div>
            <p className="text-xl font-bold font-mono tabular-nums leading-none text-running">
              {((activity.distance || 0) / 1000).toFixed(2)}
            </p>
            <SectionLabel className="mt-0.5">km</SectionLabel>
          </div>
          <div>
            <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
              {typeof activity.avgPace === "number"
                ? formatDur(activity.avgPace)
                : activity.avgPace || "--:--"}
            </p>
            <SectionLabel className="mt-0.5">/km</SectionLabel>
          </div>
          {activity.duration && (
            <div>
              <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                {formatDur(activity.duration)}
              </p>
              <SectionLabel className="mt-0.5">time</SectionLabel>
            </div>
          )}
          {(activity.elevationGain || 0) > 0 && (
            <div className="flex items-start gap-1">
              <Mountain className="size-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                  {activity.elevationGain}m
                </p>
                <SectionLabel className="mt-0.5">elev</SectionLabel>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Render workout content (exercises + stats)
  const renderWorkoutContent = () =>
    activity && (
      <div className="space-y-2">
        {/* Exercise details — top 3 visually. PR 4 dropped the
            slice(0, 3) cap on the persisted payload (full list goes
            to the doc so feed viewers can save the routine), so the
            slice now lives here on the render side for compactness.
            PR 4.5: rows are tappable for compare-this-lift when the
            payload has structured fields and the user isn't the
            author (no point comparing yourself to yourself). */}
        {exercises && exercises.length > 0 && (
          <div className="space-y-1">
            {exercises.slice(0, 3).map((ex, i) => {
              const hasStructured =
                typeof ex.setCount === "number" &&
                typeof ex.targetReps === "number" &&
                typeof ex.targetWeightKg === "number";
              /* Recompute the summary from structured fields when
                 available so the "0kg" leakage in old posts gets
                 fixed at render time without a backfill. Pre-PR-4
                 activities lack structured fields and fall back to
                 the persisted string. */
              // Look up exerciseId from the static EXERCISES catalogue
              // by name so the BW-vs-uncalibrated decision in
              // formatExerciseSummary uses the actual movement type.
              // Activity posts don't carry exerciseId today; matching on
              // name is the safe inference.
              const exMeta = EXERCISES.find((e) => e.name === ex.name);
              const displaySummary = hasStructured
                ? formatExerciseSummary({
                    setCount: ex.setCount as number,
                    targetReps: ex.targetReps as number,
                    targetWeightKg: ex.targetWeightKg as number,
                    exerciseId: exMeta?.id,
                  })
                : ex.summary;
              const canCompare =
                !!user?.uid && activity?.authorId !== user.uid && hasStructured;
              /* BW rows are quieter than weighted rows so a list of
                 mixed bodyweight + loaded movements doesn't read with
                 the same visual weight per row — kg numbers should
                 stand out more than "BW" strings. */
              const isBodyweight = displaySummary.endsWith(" BW");
              const summaryClass = `text-sm font-mono tabular-nums ml-2 shrink-0 ${
                isBodyweight
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
              }`;
              if (!canCompare) {
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">
                      {ex.name}
                    </span>
                    <span className={summaryClass}>{displaySummary}</span>
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() =>
                    setCompareTarget({
                      name: ex.name,
                      summary: displaySummary,
                      setCount: ex.setCount as number,
                      targetReps: ex.targetReps as number,
                      targetWeightKg: ex.targetWeightKg as number,
                    })
                  }
                  aria-label={`Compare your ${ex.name}`}
                  className="w-full flex items-center justify-between text-left -mx-1 px-1 py-0.5 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground truncate">
                    {ex.name}
                  </span>
                  <span className={summaryClass}>{displaySummary}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Muscle groups — internal taxonomy keys (horizontal_push, etc.)
            mapped to session-level labels via movementCategoryLabel
            (Push / Pull / Legs / Arms / Core). Multiple raw categories
            now collapse to the same label (horizontal_push and
            vertical_push both → "Push"), so we dedupe the labels here
            to avoid showing duplicate chips on a typical push day. */}
        {activity.muscleGroups &&
          activity.muscleGroups.length > 0 &&
          (() => {
            const labels = Array.from(
              new Set(
                (activity.muscleGroups as string[]).map(movementCategoryLabel)
              )
            );
            return (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="text-xs px-2 py-0.5 rounded-full font-medium bg-lifting/8 text-lifting"
                  >
                    {label}
                  </span>
                ))}
              </div>
            );
          })()}

        {/* Workout volume/duration/PR count */}
        <div className="flex gap-4">
          {(activity.totalVolume ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none text-lifting">
                {Math.round(activity.totalVolume ?? 0).toLocaleString()}
              </p>
              <SectionLabel className="mt-0.5">kg volume</SectionLabel>
            </div>
          )}
          {(activity.exerciseCount ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                {activity.exerciseCount}
              </p>
              <SectionLabel className="mt-0.5">exercises</SectionLabel>
            </div>
          )}
          {(prCount ?? 0) > 0 && (
            <div>
              <div className="flex items-center gap-1">
                <Star className="size-4 text-achievement fill-achievement" />
                <p className="text-lg font-bold font-mono tabular-nums leading-none text-achievement">
                  {prCount}
                </p>
              </div>
              <SectionLabel className="mt-0.5">PRs</SectionLabel>
            </div>
          )}
          {(activity.duration ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                {Math.round((activity.duration ?? 0) / 60)}
              </p>
              <SectionLabel className="mt-0.5">min</SectionLabel>
            </div>
          )}
        </div>
      </div>
    );

  return (
    <div className="bg-card rounded-2xl overflow-hidden shadow-sm">
      {/* Hybrid card: map on top (shorter), then divider, then workout content */}
      {isHybrid ? (
        <>
          {renderRunContent("h-[120px]")}
          <div className="border-b border-border/30 mx-4" />
          <div className="p-4 pb-0">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-2">
              <Link
                to={`/user/${feedItem.authorId}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar
                  photoURL={feedItem.authorPhotoURL}
                  displayName={feedItem.authorName}
                  size="lg"
                  fallbackBg={`${THEME.brand}20`}
                  fallbackColor={THEME.brand}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold truncate text-foreground">
                      {feedItem.authorName}
                    </p>
                    {fromYourCrew && (
                      <span
                        className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: `${THEME.brand}14`,
                          color: THEME.brand,
                        }}
                      >
                        From your crew
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground">{timeAgo}</p>
                </div>
              </Link>
              {renderMenuButton()}
            </div>
            {activityTitle && (
              <p className="text-sm font-bold text-foreground mb-2">
                {activityTitle}
              </p>
            )}
            <div className="mb-3">{renderWorkoutContent()}</div>
          </div>
        </>
      ) : (
        <>
          {/* Standard run card: map on top */}
          {isRun &&
            activity?.routePreview &&
            (activity.routePreview as { lat: number; lon: number }[]).length >
              1 && (
              <div
                className="h-28 border-b border-border/50"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <MiniRoute
                  preview={
                    activity.routePreview as { lat: number; lon: number }[]
                  }
                />
              </div>
            )}

          <div className="p-4">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-2">
              <Link
                to={`/user/${feedItem.authorId}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar
                  photoURL={feedItem.authorPhotoURL}
                  displayName={feedItem.authorName}
                  size="lg"
                  fallbackBg={avatarBg}
                  fallbackColor={avatarColor}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold truncate text-foreground">
                      {feedItem.authorName}
                    </p>
                    {fromYourCrew && (
                      <span
                        className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: `${THEME.brand}14`,
                          color: THEME.brand,
                        }}
                      >
                        From your crew
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {isRun ? (
                      <Footprints className="size-3.5 text-running" />
                    ) : (
                      <Dumbbell className="size-3.5 text-lifting" />
                    )}
                    <p className="text-[13px]">{timeAgo}</p>
                  </div>
                </div>
              </Link>
              {renderMenuButton()}
            </div>

            {/* Activity title */}
            {activityTitle && (
              <p className="text-sm font-bold text-foreground mb-2">
                {activityTitle}
              </p>
            )}

            {/* Summary line (fallback for old activities without title) */}
            {!activityTitle && feedItem.summary && (
              <p className="text-[13px] text-muted-foreground mb-3">
                {feedItem.summary}
              </p>
            )}

            {/* Author caption — optional note attached at share time
                via ShareComposerSheet. Sits between the title and the
                stats so it reads as the author's voice on the activity,
                separate from the auto-generated stat blocks below. */}
            {typeof activity?.caption === "string" &&
              activity.caption.trim().length > 0 && (
                <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap mb-3">
                  {activity.caption}
                </p>
              )}

            {/* Run stats */}
            {isRun && activity && (
              <div className="flex gap-5 mb-3">
                <div>
                  <p className="text-xl font-bold font-mono tabular-nums leading-none text-running">
                    {((activity.distance || 0) / 1000).toFixed(2)}
                  </p>
                  <SectionLabel className="mt-0.5">km</SectionLabel>
                </div>
                <div>
                  <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                    {typeof activity.avgPace === "number"
                      ? formatDur(activity.avgPace)
                      : activity.avgPace || "--:--"}
                  </p>
                  <SectionLabel className="mt-0.5">/km</SectionLabel>
                </div>
                {activity.duration && (
                  <div>
                    <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                      {formatDur(activity.duration)}
                    </p>
                    <SectionLabel className="mt-0.5">time</SectionLabel>
                  </div>
                )}
                {(activity.elevationGain || 0) > 0 && (
                  <div className="flex items-start gap-1">
                    <Mountain className="size-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                        {activity.elevationGain}m
                      </p>
                      <SectionLabel className="mt-0.5">elev</SectionLabel>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workout content */}
            {!isRun && activity && (
              <div className="mb-3">{renderWorkoutContent()}</div>
            )}

            {!activity && !feedItem.summary && (
              <p className="text-sm text-muted-foreground mb-3">Activity</p>
            )}
          </div>
        </>
      )}

      <div className="px-4 pb-4">
        {/* PR Highlight */}
        {(feedItem.prHit || activity?.prHit) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 bg-achievement/10 border border-achievement/20">
            <Trophy className="size-4 text-achievement shrink-0" />
            <p className="text-xs font-medium text-achievement">
              New PR:{" "}
              {feedItem.prExercise || activity?.prExercise || "Personal Record"}{" "}
              {feedItem.prWeight || activity?.prWeight
                ? `${feedItem.prWeight || activity?.prWeight}kg`
                : ""}
            </p>
          </div>
        )}

        {/* Challenge Milestone */}
        {(feedItem.challengeMilestone || activity?.challengeMilestone) && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
            style={{
              background: `${THEME.brand}10`,
              border: `1px solid ${THEME.brand}25`,
            }}
          >
            <Target
              className="size-4 shrink-0"
              style={{ color: THEME.brand }}
            />
            <p className="text-xs font-medium" style={{ color: THEME.brand }}>
              {feedItem.challengeMilestone || activity?.challengeMilestone}
            </p>
          </div>
        )}

        {/* Actions — social bar. Divider sits at /20 (subtle hairline)
            so the action row reads as a continuation of the card
            rather than a hard split. */}
        <div className="flex items-center gap-5 pt-2.5 border-t border-border/20">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleHighFive}
              disabled={liked}
              aria-label={liked ? "Props given" : "Give props"}
              /* p-3 -m-3 keeps the visible icon size but expands the
                 hit area to ~44×44 (12px padding × 2 + 20px icon).
                 The negative margin pulls the button back into the
                 row's spacing so the inflated tap zone is invisible
                 to layout. Same pattern applied to all action buttons
                 in this row. */
              className="p-3 -m-3 transition-transform"
              style={{
                transform: flameAnimating ? "scale(1.3)" : "scale(1)",
                transition: "transform 200ms ease-out",
              }}
            >
              <Flame
                className={`size-5 ${liked ? "fill-current" : ""}`}
                style={{
                  color: liked
                    ? THEME.amberLight
                    : "var(--color-muted-foreground)",
                  opacity: liked ? 1 : 0.5,
                }}
              />
            </button>
            {kudosCount > 0 && (
              <button
                type="button"
                onClick={handleShowKudosList}
                aria-label={`${kudosCount} props — show list`}
                className="text-xs font-medium font-mono tabular-nums text-muted-foreground hover:text-foreground transition-colors"
              >
                {kudosCount}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCommentSheet(true)}
            aria-label="View comments"
            className="flex items-center gap-1.5 p-3 -m-3 text-muted-foreground active:scale-90 transition-transform"
          >
            <MessageCircle className="size-5" />
            {(activity?.commentCount ?? 0) > 0 && (
              <span className="text-xs font-medium font-mono tabular-nums">
                {activity!.commentCount}
              </span>
            )}
          </button>
          {canSaveRoutine && (
            <button
              type="button"
              onClick={() => setShowSaveRoutine(true)}
              aria-label="Save as routine"
              className="p-3 -m-3 text-muted-foreground active:scale-90 transition-transform"
            >
              <BookmarkPlus className="size-5" />
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(feedItem)}
              aria-label="Share activity"
              className="ml-auto p-3 -m-3 text-muted-foreground active:scale-90 transition-transform"
            >
              <Share2 className="size-5" />
            </button>
          )}
        </div>

        {/* Kudos list popup */}
        {showKudosList && (
          <div className="mt-2 p-3 rounded-xl bg-muted space-y-2">
            <SectionLabel>Props from</SectionLabel>
            {kudosLoading ? (
              <div className="flex items-center justify-center py-2">
                <Spinner size="sm" variant="primary" label="Loading props" />
              </div>
            ) : kudosUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                Couldn&apos;t load props right now. Try again.
              </p>
            ) : (
              kudosUsers.map((u) => (
                <div key={u.userId} className="flex items-center gap-2">
                  <BlockAwareAvatar
                    uid={u.userId}
                    photoURL={u.photoURL}
                    displayName={u.userName}
                    size="sm"
                  />
                  <span className="text-xs font-medium text-foreground">
                    {u.userName}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Comment bottom sheet */}
      <CommentSheet
        activityId={feedItem.activityId}
        activityAuthorId={activity?.authorId as string | undefined}
        open={showCommentSheet}
        onOpenChange={setShowCommentSheet}
        commentCount={activity?.commentCount}
        quickChips={chips}
      />

      {/* Save-as-routine sheet — only mounts when the gate above
          said the activity is eligible AND the user has tapped the
          bookmark icon. Defaults the routine name to the source
          workout's display name; user can rename inside the sheet. */}
      {canSaveRoutine && showSaveRoutine && (
        <SaveRoutineSheet
          open={showSaveRoutine}
          onClose={() => setShowSaveRoutine(false)}
          defaultName={
            (activity?.workoutName as string | undefined) ||
            activityTitle ||
            "Saved routine"
          }
          sourceActivityId={feedItem.activityId}
          sourceAuthorId={(activity?.authorId as string) || ""}
          sourceAuthorName={feedItem.authorName || "Athlete"}
          sourceWorkoutName={activity?.workoutName as string | undefined}
          exercises={routineExercises}
        />
      )}

      {/* Compare-this-lift sheet (PR 4.5) — opens when the user taps
          a tappable exercise row above. compareTarget being non-null
          drives both open state and content. */}
      {compareTarget && (
        <ExerciseCompareSheet
          open={compareTarget !== null}
          onClose={() => setCompareTarget(null)}
          exerciseName={compareTarget.name}
          authorSummary={compareTarget.summary}
          authorSetCount={compareTarget.setCount}
          authorTargetReps={compareTarget.targetReps}
          authorTargetWeightKg={compareTarget.targetWeightKg}
        />
      )}

      {/* Report Modal */}
      {showReport && (
        <ReportModal
          targetType="activity"
          targetId={feedItem.activityId}
          targetAuthorUid={feedItem.authorId}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Block Confirm */}
      <ConfirmDialog
        open={showBlockConfirm}
        title="Block this user?"
        description={`They won't be able to see your activities and you won't see theirs.`}
        confirmLabel="Block"
        destructive
        onConfirm={async () => {
          setShowBlockConfirm(false);
          if (!user || !activity?.authorId) return;
          haptic("heavy");
          try {
            await blockUser(user.uid, activity.authorId as string);
            // Push the new uid into the shared useBlockedUsers cache so
            // every subscriber (Social.tsx feed filters, suggested
            // people, etc.) sees the block immediately. Without this,
            // the user would write to Firestore but their feed kept
            // showing the blocked user's posts until the next refresh.
            addBlocked(activity.authorId as string);
            toast.success(`Blocked ${feedItem.authorName}`);
          } catch {
            toast.error(`Couldn't block ${feedItem.authorName}. Try again.`);
          }
        }}
        onCancel={() => setShowBlockConfirm(false)}
      />
    </div>
  );

  function renderMenuButton() {
    if (!user || activity?.authorId === user.uid) return null;
    return (
      <div className="relative">
        <IconButton
          onClick={() => setShowMenu(!showMenu)}
          aria-label="More options"
          aria-expanded={showMenu}
          icon={<MoreHorizontal />}
        />
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              role="presentation"
              aria-hidden="true"
              onClick={() => setShowMenu(false)}
            />
            <div
              className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-44"
              role="menu"
              tabIndex={-1}
              ref={(el) => el?.focus()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowMenu(false);
                }
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMenu(false);
                  setShowReport(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Flag className="size-4 text-muted-foreground" />
                Report activity
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMenu(false);
                  setShowBlockConfirm(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
              >
                <Ban className="size-4" />
                Block user
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
}

export default memo(ActivityCard);
