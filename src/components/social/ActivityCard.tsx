import { BLOCK_DIALOG_DESCRIPTION } from "@/lib/blockCopy";
import { useState, memo, useEffect, useRef, type ReactNode } from "react";
import { formatClock } from "@/utils/formatters";
import SectionLabel from "@/components/ui/SectionLabel";
import MetaLine from "@/components/ui/MetaLine";
import { Link } from "react-router-dom";
import InlineFollow from "@/components/social/InlineFollow";
import { useAuth } from "../../lib/auth";
import { giveHighFive, getKudosList, blockUser } from "../../lib/socialApi";
import { useBlockedUsers } from "../../hooks/useBlockedUsers";
import { useRestrictedStatus } from "../../hooks/useRestrictedStatus";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "../../lib/accountRestriction";
import {
  activityExercisesToRoutine,
  type SavedRoutineExercise,
} from "../../lib/savedRoutines";
import {
  liftPostExerciseCount,
  liftPostLeadArt,
  liftPostRowDone,
  liftPostRows,
} from "../../lib/liftPost";
import { generatedDayType } from "@/lib/liftDayLabel";
import { formArtCutoutUrl, type FormArtCutout } from "@/lib/formArtCutouts";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { formatLoad, liftUnitLabel, liftVolumeIn } from "@/lib/liftLoad";
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

import MiniMuscleFigure, { hasMuscleFigure } from "./MiniMuscleFigure";
import RouteScene from "./RouteScene";
import { getTimeAgo } from "../../lib/timeAgo";
import { Spinner } from "../ui/Spinner";
import { IconButton } from "../ui/IconButton";
import { distanceValue, paceMinSec } from "@/lib/runLabels";
import {
  distanceUnitLabel,
  paceUnitLabel,
  elevationUnitLabel,
} from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { elevationLabel } from "@/lib/runLabels";

const formatDur = formatClock;

const RUN_CHIPS = ["Nice run", "Great pace", "Keep it up"];

/* Written out whole, so Tailwind sees every class it has to build. */
const RUN_STAT_COLUMNS =
  "grid-cols-[repeat(3,minmax(max-content,1fr))] @max-[17.5em]:grid-cols-[repeat(2,minmax(max-content,1fr))] @max-[14.5em]:grid-cols-[minmax(max-content,1fr)]";
const LIFT_CHIPS = ["Great lift", "Solid session", "Strong work"];

/** The exercise rows a card in a list draws; the post's own page draws
 *  them all. */
const FEED_EXERCISE_ROWS = 3;

interface ActivityCardProps {
  feedItem: FeedItem;
  onShare?: (item: FeedItem) => void;
  /** Offer Follow beside the author when the viewer doesn't follow them
   *  (Explore). Never on your own post. */
  followAuthor?: boolean;
  /** Open the comments as the card mounts: a comment notice opens the
   *  post to answer it. */
  openComments?: boolean;
  /** Draw every exercise on the post, as its own page does. A card in a
   *  list draws the first three and links the rest to that page. */
  allExercises?: boolean;
}

function ActivityCard({
  feedItem,
  onShare,
  followAuthor,
  openComments = false,
  allExercises = false,
}: ActivityCardProps) {
  const { user, profile } = useAuth();
  /* The VIEWER's unit, not the poster's — a feed reads in the units of
     whoever is reading it, which is what every social running app does. */
  const unit = useDistanceUnit();
  /* Lift18: someone else's loads in the reader's unit, as their distance
     is. Posts store kg. */
  const liftUnit = useLiftUnit();
  const volumeFigure = (kg: number) =>
    Math.round(liftVolumeIn(kg, liftUnit)).toLocaleString();
  const volumeLabel = `${liftUnitLabel(liftUnit)} volume`;
  const { blocked, addBlocked } = useBlockedUsers();
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const [liked, setLiked] = useState(feedItem.liked ?? false);
  const [kudosCount, setKudosCount] = useState(feedItem.kudosCount ?? 0);
  const [showCommentSheet, setShowCommentSheet] = useState(openComments);
  /* Comments added or deleted from this card's sheet. The post's own
     count is written by the server and reaches the card only on the next
     feed read, so the card adds what it saw happen. */
  const [commentDelta, setCommentDelta] = useState(0);
  const [flameAnimating, setFlameAnimating] = useState(false);
  // The flame's pulse ends on a timer; a card that goes away first clears
  // it, so it never sets state on an unmounted card.
  const flameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flameTimer.current) clearTimeout(flameTimer.current);
    },
    []
  );
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
  const commentTotal = Math.max(
    0,
    (activity?.commentCount ?? 0) + commentDelta
  );
  const showFollow =
    !!followAuthor && !!feedItem.authorId && feedItem.authorId !== user?.uid;

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
  /* The exercises the card draws: one with no set done is left out of
     the routine as it is left off the card. */
  const routineExercises: SavedRoutineExercise[] = canSaveRoutine
    ? activityExercisesToRoutine(rawExercises.filter(liftPostRowDone))
    : [];

  const rawTitle = (activity?.activityTitle ||
    activity?.workoutName ||
    activity?.runName) as string | undefined;
  /* A programme lift posts under its day's stored name ("Pull — Lat
     Focus"); the feed names it by its type ("Pull"), as the app does where
     the week is not to hand (Lift19). */
  const activityTitle = rawTitle
    ? (generatedDayType(rawTitle) ?? rawTitle)
    : undefined;
  const isRun = feedItem.type === "run";
  const isHybrid = !!(
    activity?.routePreview &&
    (activity.routePreview as { lat: number; lon: number }[]).length > 1 &&
    activity?.exercises &&
    (activity.exercises as unknown[]).length > 0
  );

  const handleHighFive = async () => {
    if (!user || liked) return; // One-way — can't undo
    // A restricted account gives no props (S4e); the tap says why.
    if (isRestricted) {
      haptic("error");
      showRestrictedToast();
      return;
    }
    // Optimistic UI
    setLiked(true);
    setKudosCount((c) => c + 1);
    // Animate
    setFlameAnimating(true);
    if (flameTimer.current) clearTimeout(flameTimer.current);
    flameTimer.current = setTimeout(() => setFlameAnimating(false), 200);
    haptic("light");

    try {
      // 2026-05-26 audit PR 3 (finding #6) — kudos notification is
      // now written server-side inside `toggleKudosCallable`, so the
      // client no longer makes a separate /notifications/* write.
      // The `fromName` sent here is ignored: the callable names the
      // sender from their public profile, server-side.
      await giveHighFive(feedItem.activityId, user.uid, {
        fromName: profile?.displayName || "Someone",
      });
    } catch (err) {
      // Network / auth failure — revert the optimistic flip so the
      // UI reflects the server truth. Error haptic signals the bounce.
      setLiked(false);
      setKudosCount((c) => Math.max(0, c - 1));
      haptic("error");
      // A restriction that landed after the feed loaded.
      if (isRestrictedRefusal(err)) showRestrictedToast();
      // The haptic alone says nothing on the web, where the count just
      // drops back.
      else toast.error("Couldn't give props. Try again.");
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

  /* Every shape of lift post the feed holds, read one way: a post made
     from a saved workout once wrote rows with no summary, and drawing them
     broke the card. */
  const exercises = liftPostRows(activity?.exercises, liftUnit);
  const shownExercises = allExercises
    ? exercises
    : exercises.slice(0, FEED_EXERCISE_ROWS);
  const moreExercises = exercises.length - shownExercises.length;
  /* The exercises done, as the post's page lists them: a stored count can
     include one with no set done. */
  const exerciseCount = activity ? liftPostExerciseCount(activity) : 0;
  /* The movement labels, less one that only repeats the title (or the
     summary drawn in its place): a Push day's post is titled "Push"
     already. */
  const titleKey = (activityTitle || feedItem.summary)?.trim().toLowerCase();
  const muscleLabels = Array.from(
    new Set(
      ((activity?.muscleGroups as string[] | undefined) ?? []).map(
        movementCategoryLabel
      )
    )
  ).filter((label) => label.trim().toLowerCase() !== titleKey);
  const prCount = activity?.prCount as number | undefined;

  /* ---- Hero panels (Social uplift v1) -------------------------------
     Runs: the GPS trace becomes a glowing scene with the distance
     numeral overlaid ON the art (so the km cell drops out of the stats
     strip below — no double-printing). Lifts: the drawing of the
     session's lead lift, its working muscles tinted in the drawing, with
     the volume numeral and PR chip overlaid the same way; a post with no
     drawn lift keeps the anatomy figure with its muscles tinted (the
     owner, on the figure alone: "Why is it just the muscle groups worked?
     It looks silly"). Hybrid cards keep the route scene only — two hero
     panels on one card would fight. */
  const routePreview =
    activity?.routePreview &&
    (activity.routePreview as { lat: number; lon: number }[]).length > 1
      ? (activity.routePreview as { lat: number; lon: number }[])
      : undefined;
  const showDistanceOverlay = !!routePreview && (activity?.distance || 0) > 0;
  const muscleCategories =
    (activity?.muscleGroups as string[] | undefined) ?? [];
  const leadArt =
    !isRun && !isHybrid ? liftPostLeadArt(activity?.exercises) : null;
  const showMuscleHero =
    !leadArt && !isRun && !isHybrid && hasMuscleFigure(muscleCategories);
  const showLiftHero = !!leadArt || showMuscleHero;
  const showVolumeOverlay = showLiftHero && (activity?.totalVolume ?? 0) > 0;
  const showPrChip = showLiftHero && (prCount ?? 0) > 0;

  const renderRouteHero = (heightClass: string) => (
    <div
      className={`relative ${heightClass} border-b border-border/50`}
      style={{
        background: `linear-gradient(150deg, ${THEME.running}24 0%, ${THEME.running}0A 55%, ${THEME.running}12 100%)`,
      }}
    >
      <RouteScene preview={routePreview!} />
      {showDistanceOverlay && (
        <div className="absolute bottom-3 left-4">
          <p className="text-2xl font-extrabold font-figure tabular-nums leading-none text-running">
            {distanceValue(activity?.distance || 0, unit, 2)}
          </p>
          <SectionLabel className="mt-0.5">
            {distanceUnitLabel(unit)}
          </SectionLabel>
        </div>
      )}
    </div>
  );

  /* The volume numeral and the PR chip a lift's hero carries, whichever
     hero it is. */
  const renderVolumeFigure = (className: string) => (
    <div className={className}>
      <p className="text-2xl font-extrabold font-figure tabular-nums leading-none text-lifting">
        {volumeFigure(activity?.totalVolume ?? 0)}
      </p>
      <SectionLabel className="mt-0.5">{volumeLabel}</SectionLabel>
    </div>
  );
  const renderPrChip = (className: string) => (
    <span
      className={`${className} inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-achievement/15 text-achievement-strong`}
    >
      <Star className="size-3.5 fill-achievement" />
      {prCount} PR{prCount === 1 ? "" : "s"}
    </span>
  );

  const liftHeroBackground = {
    background: `linear-gradient(150deg, ${THEME.lifting}22 0%, ${THEME.lifting}08 55%, ${THEME.lifting}10 100%)`,
  };

  /* The lead lift's drawing at the right, the numbers at the left: Home's
     Today card, in the feed. Alone, the drawing takes the middle.
     Beside the numbers, the two share one row, so a wide number
     ("128,450") narrows the drawing instead of being drawn through it.
     On a card under 12em, as at large text sizes, what is left for the
     drawing is a thumbnail in a tall panel: it goes, and the panel
     closes up around the numbers. The volume still reads before the PR
     chip. */
  const renderDrawingHero = (art: FormArtCutout) => {
    const flanked = showVolumeOverlay || showPrChip;
    const drawing = (className: string) => (
      <img
        src={formArtCutoutUrl(art)}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        loading="lazy"
        data-lead-drawing=""
        className={`exercise-drawing pointer-events-none object-contain ${className}`}
      />
    );
    if (!flanked) {
      return (
        <div
          className="relative h-40 border-b border-border/50 overflow-hidden"
          style={liftHeroBackground}
        >
          {drawing(
            "absolute inset-y-3 h-[calc(100%-1.5rem)] inset-x-3 w-[calc(100%-1.5rem)] object-bottom"
          )}
        </div>
      );
    }
    return (
      <div
        className="flex h-40 gap-3 border-b border-border/50 overflow-hidden @max-[12em]:h-auto"
        style={liftHeroBackground}
      >
        <div className="my-3 ml-4 flex shrink-0 flex-col-reverse items-start gap-2">
          {showVolumeOverlay && renderVolumeFigure("mt-auto")}
          {showPrChip && renderPrChip("mb-auto")}
        </div>
        {drawing(
          "my-3 mr-3 ml-auto h-[calc(100%-1.5rem)] min-w-0 max-w-[58%] flex-1 object-right-bottom @max-[12em]:hidden"
        )}
      </div>
    );
  };

  /* The muscle figure in the middle, the volume at its left and the PR
     chip at its right, in one row: the two sides take equal shares, so
     the figure sits in the middle while they fit beside it, moves aside
     for a wide number and then narrows. Under 14em the figure goes and
     the panel closes up around the numbers, as the drawing's does; the
     chip takes a column of its own here, so it needs more room. */
  const renderMuscleHero = () => {
    const flanked = showVolumeOverlay || showPrChip;
    return (
      <div
        className={`flex h-32 gap-3 border-b border-border/50 overflow-hidden ${
          flanked
            ? "@max-[14em]:h-auto @max-[14em]:flex-col-reverse @max-[14em]:gap-2 @max-[14em]:py-3"
            : ""
        }`}
        style={liftHeroBackground}
      >
        <div className="my-3 ml-4 flex min-w-max flex-1 items-end @max-[14em]:my-0 @max-[14em]:flex-none @max-[14em]:empty:hidden">
          {showVolumeOverlay && renderVolumeFigure("")}
        </div>
        <div
          className={`flex min-w-0 items-center justify-center py-2 ${
            flanked ? "@max-[14em]:hidden" : ""
          }`}
        >
          <MiniMuscleFigure
            categories={muscleCategories}
            className="h-28 w-auto max-w-full"
          />
        </div>
        <div className="my-3 mr-4 flex min-w-max flex-1 items-start justify-end @max-[14em]:my-0 @max-[14em]:ml-4 @max-[14em]:flex-none @max-[14em]:justify-start @max-[14em]:empty:hidden">
          {showPrChip && renderPrChip("")}
        </div>
      </div>
    );
  };

  /* The words on the post: its title, the summary older posts carry in
     its place, and the author's caption. One block for the standard and
     the hybrid card, so a caption written on a hybrid session is not
     dropped. Each wraps rather than clips: a title or caption is typed
     by a person, and one long word (a German compound, a pasted link)
     has nowhere to go at 320px otherwise. `dir="auto"` lets an Arabic or
     Hebrew title read from its own side. */
  const renderPostText = () => (
    <>
      {activityTitle && (
        <p
          dir="auto"
          className="text-base font-bold text-foreground mb-2 break-words"
        >
          {activityTitle}
        </p>
      )}

      {/* Summary line (fallback for old activities without title) */}
      {!activityTitle && feedItem.summary && (
        <p
          dir="auto"
          className="text-small text-muted-foreground mb-3 break-words"
        >
          {feedItem.summary}
        </p>
      )}

      {/* Author caption — optional note attached at share time
          via ShareComposerSheet. Sits between the title and the
          stats so it reads as the author's voice on the activity,
          separate from the auto-generated stat blocks below. */}
      {typeof activity?.caption === "string" &&
        activity.caption.trim().length > 0 && (
          <p
            dir="auto"
            className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap break-words mb-3"
          >
            {activity.caption}
          </p>
        )}
    </>
  );

  /* A run's numbers: pace, time and elevation, and distance too when no
     route scene carries it. One grid for the run card and the hybrid
     card, below the author and the title on both. The hybrid card once
     drew them under its route, above the author, where they read as the
     card before's; and the run card's own copy printed the pace per km
     under a "/mi" label for anyone who uses miles. */
  const renderRunStats = () =>
    activity && (
      /* A three-column GRID, not a flex row. The row can carry FOUR
           metrics (distance + pace + time + elevation) whenever there is
           no route preview to host the distance overlay, and `flex
           gap-5` gave them no way to wrap — on a 375px screen the fourth
           went off the card. The grid wraps the overflow metric onto a
           second line and keeps the columns aligned between the two.
           Each column is at least as wide as its figure, so a long
           time ("12:34:56" at 320px) never draws over the elevation
           beside it; a short figure still takes a third. Three
           columns need about 17.5em of card, two about 14.5em; under
           that, as at large text sizes, the figures stack. */
      <div className={`grid ${RUN_STAT_COLUMNS} gap-x-3 gap-y-3 mb-3`}>
        {!showDistanceOverlay && (
          /* Distance is the primary metric of a run, and it already
               renders that way at text-2xl/800 in the route-hero overlay
               above. Matching it here means the two paths agree instead
               of the no-route card quietly demoting distance to a peer
               of pace and time. */
          <div className="min-w-0">
            <p className="text-2xl font-extrabold font-figure tabular-nums leading-none text-running whitespace-nowrap">
              {distanceValue(activity.distance || 0, unit, 2)}
            </p>
            <SectionLabel className="mt-0.5">
              {distanceUnitLabel(unit)}
            </SectionLabel>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xl font-bold font-figure tabular-nums leading-none text-foreground whitespace-nowrap">
            {typeof activity.avgPace === "number"
              ? paceMinSec(activity.avgPace, unit)
              : activity.avgPace || "--:--"}
          </p>
          {/* A pace posted as text is per km whatever the reader's unit,
               so it keeps its own label rather than borrowing "/mi". */}
          <SectionLabel className="mt-0.5">
            {paceUnitLabel(typeof activity.avgPace === "string" ? "km" : unit)}
          </SectionLabel>
        </div>
        {(activity.duration ?? 0) > 0 && (
          <div className="min-w-0">
            <p className="text-xl font-bold font-figure tabular-nums leading-none text-foreground whitespace-nowrap">
              {formatDur(activity.duration ?? 0)}
            </p>
            <SectionLabel className="mt-0.5">Time</SectionLabel>
          </div>
        )}
        {(activity.elevationGain || 0) > 0 && (
          <div className="min-w-0">
            {/* The unit is its own muted span, smaller than the
                  numeral, because this cell's caption is taken by
                  "Elevation" where its siblings' captions carry their
                  units. A space before it, as the run screens' stat grid
                  writes "342 m": nothing here is short of room (the cell
                  is at least as wide as its figure), so a glued unit
                  would be no compact variant, only the one unit on the
                  card drawn another way.

                  The Mountain icon used to be a SIBLING of this stack
                  inside a `flex gap-1`, which pushed the numeral and its
                  caption ~20px inboard of the grid column while every
                  peer cell sat flush against it. It now rides in the
                  caption, so the figures line up and the icon still
                  marks the cell. */}
            <p className="text-xl font-bold font-figure tabular-nums leading-none text-foreground whitespace-nowrap">
              {elevationLabel(activity.elevationGain ?? 0, unit, false)}{" "}
              <span className="text-caption font-semibold text-muted-foreground">
                {elevationUnitLabel(unit)}
              </span>
            </p>
            <SectionLabel className="mt-0.5 flex items-center gap-1">
              <Mountain className="size-3 shrink-0" aria-hidden="true" />
              Elevation
            </SectionLabel>
          </div>
        )}
      </div>
    );

  // Render workout content (exercises + stats)
  const renderWorkoutContent = () =>
    activity && (
      <div className="space-y-2">
        {/* Exercise details — the first three in a list, every one on
            the post's own page, which "+N more" opens. The post holds
            the full list, so feed viewers can save the routine.
            Rows are tappable for compare-this-lift when the payload has
            structured fields and the user isn't the author (no point
            comparing yourself to yourself). */}
        {exercises.length > 0 && (
          <div className="space-y-1">
            {shownExercises.map((ex, i) => {
              /* The summary is formatted from the row's figures when it
                 has any, so the "0kg" in old posts is fixed as it is drawn,
                 without a backfill. */
              const displaySummary = ex.summary;
              const structured = ex.structured;
              const canCompare =
                !!user?.uid && activity?.authorId !== user.uid && !!structured;
              /* BW rows are quieter than weighted rows so a list of
                 mixed bodyweight + loaded movements doesn't read with
                 the same visual weight per row — kg numbers should
                 stand out more than "BW" strings. */
              const isBodyweight = displaySummary.endsWith(" BW");
              /* whitespace-nowrap joins shrink-0: a summary like
                 "3 x 8 60kg" was free to break mid-token once the name
                 beside it grew. The name owns the flexible half, the
                 summary owns a fixed one. */
              const summaryClass = `ml-auto text-sm font-mono tabular-nums shrink-0 whitespace-nowrap ${
                isBodyweight ? "text-muted-foreground" : "text-muted-foreground"
              }`;
              if (!canCompare) {
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5"
                  >
                    {/* An explicit min-width with flex-1: `truncate`
                        alone cannot shrink a flex child whose default
                        min-width is `auto`, so a long exercise name
                        pushed its set/rep summary out of the card
                        instead of ellipsing. 6em rather than 0: when
                        the name and the summary cannot share the row
                        (large text), the summary wraps under the name
                        instead of cutting it to one letter. */}
                    <span className="min-w-[min(6em,100%)] flex-1 truncate text-sm font-medium text-foreground">
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
                    structured &&
                    setCompareTarget({
                      name: ex.name,
                      summary: displaySummary,
                      ...structured,
                    })
                  }
                  aria-label={`Compare your ${ex.name}`}
                  className="w-full flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-left -mx-1 px-1 py-0.5 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span className="min-w-[min(6em,100%)] flex-1 truncate text-sm font-medium text-foreground">
                    {ex.name}
                  </span>
                  <span className={summaryClass}>{displaySummary}</span>
                </button>
              );
            })}
            {/* The rest of the list, one quiet row that opens the post.
                Its own row height clears the touch floor, so it does not
                reach over the compare row above it. */}
            {moreExercises > 0 && (
              <Link
                to={`/activity/${encodeURIComponent(feedItem.activityId)}`}
                className="flex min-h-[44px] w-full items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>
                  <span className="font-mono tabular-nums">
                    +{moreExercises}
                  </span>{" "}
                  more{" "}
                  <span className="sr-only">
                    {moreExercises === 1 ? "exercise" : "exercises"}
                  </span>
                </span>
              </Link>
            )}
          </div>
        )}
        {/* Muscle groups — internal taxonomy keys (horizontal_push, etc.)
            mapped to session-level labels via movementCategoryLabel
            (Push / Pull / Legs / Arms / Core). Multiple raw categories
            collapse to the same label (horizontal_push and
            vertical_push both → "Push"), so the labels are deduped, and
            one the title already says is left out (`muscleLabels`).
            Static facts, so one quiet line rather than chips — pills on
            this surface mean a state (the PR badge), not a fact. */}
        <MetaLine size="xs" items={muscleLabels} />
        {/* Workout volume/duration/PR count. Cells already printed on
            the lift's hero panel (volume numeral, PR chip) drop out
            here — same no-double-printing rule as the run card's km. */}
        {/* Two columns rather than an unconstrained flex row. Volume,
            exercises, PRs and duration can all be present at once, and a
            volume like "12,480" is wide enough that four flex cells left
            the card at 375px. Two columns give every cell a predictable
            half-width and wrap the rest onto a second line, and stack
            to one column when the card is too narrow in em for two. */}
        <div className="grid grid-cols-[repeat(2,minmax(max-content,1fr))] @max-[14.5em]:grid-cols-[minmax(max-content,1fr)] gap-x-4 gap-y-3">
          {!showVolumeOverlay && (activity.totalVolume ?? 0) > 0 && (
            /* Volume is the primary metric of a lift, and renders at
               text-2xl/800 in the muscle-hero overlay already — this
               matches it so the two paths agree. */
            <div className="min-w-0">
              <p className="text-2xl font-extrabold font-figure tabular-nums leading-none text-lifting whitespace-nowrap">
                {volumeFigure(activity.totalVolume ?? 0)}
              </p>
              <SectionLabel className="mt-0.5">{volumeLabel}</SectionLabel>
            </div>
          )}
          {exerciseCount > 0 && (
            <div className="min-w-0">
              <p className="text-xl font-bold font-figure tabular-nums leading-none text-foreground whitespace-nowrap">
                {exerciseCount}
              </p>
              <SectionLabel className="mt-0.5">
                {exerciseCount === 1 ? "exercise" : "exercises"}
              </SectionLabel>
            </div>
          )}
          {!showPrChip && (prCount ?? 0) > 0 && (
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <Star className="size-4 text-achievement fill-achievement shrink-0" />
                <p className="text-xl font-bold font-figure tabular-nums leading-none text-achievement whitespace-nowrap">
                  {prCount}
                </p>
              </div>
              <SectionLabel className="mt-0.5">
                {prCount === 1 ? "PR" : "PRs"}
              </SectionLabel>
            </div>
          )}
          {/* A hybrid card's run stats above already carry the time. */}
          {!isHybrid && (activity.duration ?? 0) > 0 && (
            <div className="min-w-0">
              <p className="text-xl font-bold font-figure tabular-nums leading-none text-foreground whitespace-nowrap">
                {Math.round((activity.duration ?? 0) / 60)}
              </p>
              <SectionLabel className="mt-0.5">min</SectionLabel>
            </div>
          )}
        </div>
      </div>
    );

  return (
    /* A query container: the rows inside lay themselves out by the
       card's width in em, so they follow the text size as well as the
       screen. At double text a 393px phone's card is 11em wide, and rows
       sized for 22em squeezed the author's name to nothing. */
    <div className="@container bg-card rounded-2xl overflow-hidden card-shadow">
      {/* Hybrid card: map on top (shorter), then divider, then workout content */}
      {isHybrid ? (
        <>
          {routePreview && renderRouteHero("h-[120px]")}
          <div className="p-4 pb-0">
            {renderAuthorRow(
              `${THEME.brand}20`,
              THEME.brand,
              <p className="text-small text-muted-foreground whitespace-nowrap @max-[14em]:whitespace-normal">
                {timeAgo}
              </p>
            )}
            {renderPostText()}
            {renderRunStats()}
            <div className="border-b border-border/30 mb-3" />
            <div className="mb-3">{renderWorkoutContent()}</div>
          </div>
        </>
      ) : (
        <>
          {/* Standard run card: route scene on top; standard lift
              card: the lead lift's drawing on top, or the muscle figure
              where no lift on the post has one. */}
          {isRun && routePreview && renderRouteHero("h-36")}
          {leadArt && renderDrawingHero(leadArt)}
          {showMuscleHero && renderMuscleHero()}

          <div className="p-4">
            {renderAuthorRow(
              avatarBg,
              avatarColor,
              <div className="flex items-center gap-1 text-muted-foreground">
                {isRun ? (
                  <Footprints className="size-3.5 text-running" />
                ) : (
                  <Dumbbell className="size-3.5 text-lifting" />
                )}
                <p className="text-small whitespace-nowrap @max-[14em]:whitespace-normal">
                  {timeAgo}
                </p>
              </div>
            )}

            {renderPostText()}

            {/* Run stats — km lives on the hero overlay when the route
                scene rendered */}
            {isRun && renderRunStats()}

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
        {/* The PR and challenge lines: an icon, then the words. Beside the
            icon, a large-text line can be narrower than one word, which
            then splits ("Comple/ted"). So on a card under 16em the icon
            stands above the words, which have the line's whole width and
            wrap between words; breaking inside a word is left for a string
            with nowhere else to go. */}
        {/* PR Highlight */}
        {(feedItem.prHit || activity?.prHit) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 bg-achievement/10 border border-achievement/20 @max-[16em]:flex-col @max-[16em]:items-start @max-[16em]:gap-1">
            <Trophy className="size-4 text-achievement shrink-0" />
            <p className="min-w-0 max-w-full break-words text-xs font-medium text-achievement-strong">
              New PR:{" "}
              {feedItem.prExercise || activity?.prExercise || "Personal Record"}{" "}
              {feedItem.prWeight || activity?.prWeight
                ? formatLoad(
                    (feedItem.prWeight || activity?.prWeight) as number,
                    liftUnit
                  )
                : ""}
            </p>
          </div>
        )}

        {/* Challenge Milestone */}
        {(feedItem.challengeMilestone || activity?.challengeMilestone) && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 @max-[16em]:flex-col @max-[16em]:items-start @max-[16em]:gap-1"
            style={{
              background: `${THEME.brand}10`,
              border: `1px solid ${THEME.brand}25`,
            }}
          >
            <Target
              className="size-4 shrink-0"
              style={{ color: THEME.brand }}
            />
            {/* Text on the -strong step — brand is 3.87:1 as 12px text on
                the light card; the Target icon keeps the identity. */}
            <p
              className="min-w-0 max-w-full break-words text-xs font-medium"
              style={{ color: "hsl(var(--primary-strong))" }}
            >
              {feedItem.challengeMilestone || activity?.challengeMilestone}
            </p>
          </div>
        )}

        {/* Actions — social bar. Divider sits at /20 (subtle hairline)
            so the action row reads as a continuation of the card
            rather than a hard split. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2.5 border-t border-border/20">
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
              /* Class-based pop (visual audit W3): the flame was the one
                 action styling itself via inline transform/transition while
                 its siblings use classes — and it ignored reduced motion.
                 motion-safe: guards the scale so the pop is opt-in. */
              className={`p-3 -m-3 transition-transform duration-200 ease-out ${
                flameAnimating ? "motion-safe:scale-125" : ""
              }`}
            >
              <Flame
                className={`size-5 ${liked ? "fill-current opacity-100" : "opacity-50"}`}
                style={{
                  color: liked
                    ? THEME.amberLight
                    : "var(--color-muted-foreground)",
                }}
              />
            </button>
            {kudosCount > 0 && (
              /* Same p-3/-m-3 hit-area pattern as the sibling actions —
                 this was a bare text-xs button (sub-44px target) next to
                 a correctly-floored flame (audit W2). */
              <button
                type="button"
                onClick={handleShowKudosList}
                aria-label={`${kudosCount.toLocaleString()} props — show list`}
                className="p-3 -m-3 text-xs font-medium font-mono tabular-nums text-muted-foreground hover:text-foreground transition-colors"
              >
                {kudosCount.toLocaleString()}
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
            {commentTotal > 0 && (
              <span className="text-xs font-medium font-mono tabular-nums">
                {commentTotal.toLocaleString()}
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
              /* Nobody either side of a block with you, as in the
                 comments below. */
              kudosUsers
                .filter((u) => !blocked.has(u.userId))
                .map((u) => (
                  <div key={u.userId} className="flex items-center gap-2">
                    <BlockAwareAvatar
                      uid={u.userId}
                      photoURL={u.photoURL}
                      displayName={u.userName}
                      size="sm"
                    />
                    <span
                      dir="auto"
                      className="min-w-0 truncate text-left text-xs font-medium text-foreground"
                    >
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
        commentCount={commentTotal}
        quickChips={chips}
        onCountChange={(delta) => setCommentDelta((d) => d + delta)}
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
            (activity?.workoutName
              ? (generatedDayType(activity.workoutName as string) ??
                (activity.workoutName as string))
              : undefined) ||
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
        description={BLOCK_DIALOG_DESCRIPTION}
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

  /* The author's avatar, name and time, which open their profile, with
     Follow and the menu at the row's end. A card 18em wide or more keeps
     the name on one line beside the avatar, ending in an ellipsis if it
     must. Narrower, as at large text sizes, the name wraps instead, and
     a name too long to sit beside the avatar goes under it, with the
     row's whole width: beside it, the name would be cut to its first
     letters ("Ale…"). One row for the standard and the hybrid card. */
  function renderAuthorRow(
    fallbackBg: string,
    fallbackColor: string,
    time: ReactNode
  ) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 @max-[18em]:items-start">
        <Link
          to={`/user/${feedItem.authorId}`}
          className="flex items-center gap-3 flex-1 min-w-[min(8em,100%)] @max-[18em]:flex-wrap @max-[18em]:gap-y-2"
        >
          <Avatar
            photoURL={feedItem.authorPhotoURL}
            displayName={feedItem.authorName}
            size="lg"
            fallbackBg={fallbackBg}
            fallbackColor={fallbackColor}
          />
          <div className="flex-1 min-w-0 @max-[18em]:flex-auto @max-[18em]:max-w-full">
            <p
              dir="auto"
              className="text-left text-sm font-semibold truncate break-words text-foreground @max-[18em]:whitespace-normal"
            >
              {feedItem.authorName}
            </p>
            {time}
          </div>
        </Link>
        {renderAuthorActions()}
      </div>
    );
  }

  /* Follow and the menu, kept together. The name beside them keeps at
     least 8em; when the row cannot also hold these, they take a line of
     their own at its end rather than squeezing the name out. */
  function renderAuthorActions() {
    const menu = renderMenuButton();
    if (!showFollow && !menu) return null;
    return (
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {showFollow && (
          <InlineFollow
            targetUid={feedItem.authorId}
            targetName={feedItem.authorName}
          />
        )}
        {menu}
      </div>
    );
  }

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
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive-strong hover:bg-muted transition-colors"
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
