import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { giveHighFive, getKudosList, writeNotification, blockUser } from '../../lib/socialApi';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { activityExercisesToRoutine, type SavedRoutineExercise } from '../../lib/savedRoutines';
import { formatExerciseSummary } from '../../lib/exerciseSummary';
import { movementCategoryLabel } from '../../lib/exerciseMovementCategory';
import CommentSheet from './CommentSheet';
import SaveRoutineSheet from './SaveRoutineSheet';
import ExerciseCompareSheet from './ExerciseCompareSheet';
import ReportModal from './ReportModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { FeedItem } from '../../hooks/useSocialFeed';
import { THEME } from '../../lib/theme';
import Avatar from '../Avatar';
import { haptic } from '../../lib/haptic';
import { MessageCircle, Flame, Footprints, Dumbbell, Trophy, Mountain, Share2, Target, Star, MoreHorizontal, Flag, Ban, BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';

import { getTimeAgo } from '../../lib/timeAgo';

function MiniRoute({ preview }: { preview: { lat: number; lon: number }[] }) {
  const lats = preview.map(p => p.lat);
  const lons = preview.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const rLat = maxLat - minLat || 0.001;
  const rLon = maxLon - minLon || 0.001;
  const pts = preview.map(p =>
    `${((p.lon - minLon) / rLon) * 188 + 6},${(1 - (p.lat - minLat) / rLat) * 68 + 6}`
  ).join(' ');
  return (
    <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Run route map">
      <polyline fill="none" stroke={THEME.running} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const RUN_CHIPS = ['Nice run!', 'Great pace!', 'Keep it up!'];
const LIFT_CHIPS = ['Great lift!', 'Beast mode!', 'Strong work!'];

function ActivityCard({ feedItem, onShare }: { feedItem: FeedItem; onShare?: (item: FeedItem) => void }) {
  const { user, profile } = useAuth();
  const { addBlocked } = useBlockedUsers();
  const [liked, setLiked] = useState(feedItem.liked ?? false);
  const [kudosCount, setKudosCount] = useState(feedItem.kudosCount ?? 0);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [flameAnimating, setFlameAnimating] = useState(false);
  const [showKudosList, setShowKudosList] = useState(false);
  const [kudosUsers, setKudosUsers] = useState<{ userId: string; userName: string; photoURL?: string }[]>([]);
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
  const canSaveRoutine =
    feedItem.type === "workout" && hasStructuredExercises;
  const routineExercises: SavedRoutineExercise[] = canSaveRoutine
    ? activityExercisesToRoutine(rawExercises)
    : [];

  const activityTitle = (activity?.activityTitle || activity?.workoutName || activity?.runName) as string | undefined;
  const isRun = feedItem.type === 'run';
  const isHybrid = !!(activity?.routePreview && (activity.routePreview as { lat: number; lon: number }[]).length > 1 && activity?.exercises && (activity.exercises as unknown[]).length > 0);

  const handleHighFive = async () => {
    if (!user || liked) return; // One-way — can't undo
    // Optimistic UI
    setLiked(true);
    setKudosCount(c => c + 1);
    // Animate
    setFlameAnimating(true);
    setTimeout(() => setFlameAnimating(false), 200);
    haptic('light');

    try {
      const sent = await giveHighFive(feedItem.activityId, user.uid);
      // `sent === false` just means "you already gave props on a previous
      // session" — state is already correct, no reconcile needed.
      // Notify activity author only when this call actually wrote new
      // kudos (avoids duplicate notifications on retry).
      if (sent && activity?.authorId && activity.authorId !== user.uid) {
        writeNotification(activity.authorId as string, {
          type: 'kudos',
          fromUserId: user.uid,
          fromName: profile?.displayName || 'Someone',
          activityId: feedItem.activityId,
          message: `${profile?.displayName || 'Someone'} gave you props on ${activityTitle || feedItem.type}`,
        }).catch(() => {});
      }
    } catch {
      // Network / auth failure — revert the optimistic flip so the
      // UI reflects the server truth. Error haptic signals the bounce.
      setLiked(false);
      setKudosCount(c => Math.max(0, c - 1));
      haptic('error');
    }
  };

  const [kudosLoading, setKudosLoading] = useState(false);

  const handleShowKudosList = async () => {
    if (showKudosList) { setShowKudosList(false); return; }
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

  const createdAtObj = feedItem.createdAt as { toDate?: () => Date } | undefined;
  const timeAgo = createdAtObj?.toDate ? getTimeAgo(createdAtObj.toDate()) : '';
  const avatarBg = isRun ? `${THEME.running}20` : `${THEME.lifting}20`;
  const avatarColor = isRun ? THEME.running : THEME.lifting;
  const chips = isRun ? RUN_CHIPS : LIFT_CHIPS;

  const exercises = activity?.exercises as Array<{
    name: string;
    summary: string;
    setCount?: number;
    targetReps?: number;
    targetWeightKg?: number;
  }> | undefined;
  const prCount = activity?.prCount as number | undefined;

  // Render run content (map + stats)
  const renderRunContent = (mapHeight = 'h-28') => (
    <>
      {activity?.routePreview && (activity.routePreview as { lat: number; lon: number }[]).length > 1 && (
        <div className={`${mapHeight} border-b border-border/50`} style={{ background: 'rgba(255,255,255,0.02)' }}>
          <MiniRoute preview={activity.routePreview as { lat: number; lon: number }[]} />
        </div>
      )}
      {activity && (
        <div className="flex gap-5 p-4 pb-0">
          <div>
            <p className="text-xl font-bold font-mono tabular-nums leading-none" style={{ color: THEME.running }}>
              {((activity.distance || 0) / 1000).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">km</p>
          </div>
          <div>
            <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
              {typeof activity.avgPace === 'number' ? formatDur(activity.avgPace) : activity.avgPace || '--:--'}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">/km</p>
          </div>
          {activity.duration && (
            <div>
              <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                {formatDur(activity.duration)}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">time</p>
            </div>
          )}
          {(activity.elevationGain || 0) > 0 && (
            <div className="flex items-start gap-1">
              <Mountain className="w-4 h-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                  {activity.elevationGain}m
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">elev</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Render workout content (exercises + stats)
  const renderWorkoutContent = () => (
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
              const displaySummary = hasStructured
                ? formatExerciseSummary({
                    setCount: ex.setCount as number,
                    targetReps: ex.targetReps as number,
                    targetWeightKg: ex.targetWeightKg as number,
                  })
                : ex.summary;
              const canCompare = !!user?.uid && activity?.authorId !== user.uid && hasStructured;
              if (!canCompare) {
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{ex.name}</span>
                    <span className="text-sm font-mono tabular-nums text-muted-foreground ml-2 shrink-0">{displaySummary}</span>
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
                  <span className="text-sm font-medium text-foreground truncate">{ex.name}</span>
                  <span className="text-sm font-mono tabular-nums text-muted-foreground ml-2 shrink-0">{displaySummary}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Muscle groups — internal taxonomy keys (horizontal_push, etc.)
            mapped to user-facing labels via movementCategoryLabel.
            Was previously rendering the raw key, leaking implementation
            tokens into the feed. */}
        {activity.muscleGroups && (
          <div className="flex flex-wrap gap-1.5">
            {(activity.muscleGroups as string[]).map((mg) => (
              <span key={mg} className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${THEME.lifting}15`, color: THEME.lifting }}>
                {movementCategoryLabel(mg)}
              </span>
            ))}
          </div>
        )}

        {/* Workout volume/duration/PR count */}
        <div className="flex gap-4">
          {(activity.totalVolume ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none" style={{ color: THEME.lifting }}>
                {Math.round(activity.totalVolume ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">kg volume</p>
            </div>
          )}
          {(activity.exerciseCount ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                {activity.exerciseCount}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">exercises</p>
            </div>
          )}
          {(prCount ?? 0) > 0 && (
            <div>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <p className="text-lg font-bold font-mono tabular-nums leading-none text-yellow-500">
                  {prCount}
                </p>
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">PRs</p>
            </div>
          )}
          {(activity.duration ?? 0) > 0 && (
            <div>
              <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                {Math.round((activity.duration ?? 0) / 60)}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">min</p>
            </div>
          )}
        </div>
      </div>
    )
  );

  return (
    <div className="bg-card rounded-2xl overflow-hidden shadow-sm">
      {/* Hybrid card: map on top (shorter), then divider, then workout content */}
      {isHybrid ? (
        <>
          {renderRunContent('h-[120px]')}
          <div className="border-b border-border/30 mx-4" />
          <div className="p-4 pb-0">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-2">
              <Link to={`/user/${feedItem.authorId}`} className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar
                  photoURL={feedItem.authorPhotoURL}
                  displayName={feedItem.authorName}
                  size="lg"
                  fallbackBg={`${THEME.brand}20`}
                  fallbackColor={THEME.brand}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-foreground">{feedItem.authorName}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo}</p>
                </div>
              </Link>
              {renderMenuButton()}
            </div>
            {activityTitle && <p className="text-sm font-bold text-foreground mb-2">{activityTitle}</p>}
            <div className="mb-3">{renderWorkoutContent()}</div>
          </div>
        </>
      ) : (
        <>
          {/* Standard run card: map on top */}
          {isRun && activity?.routePreview && (activity.routePreview as { lat: number; lon: number }[]).length > 1 && (
            <div className="h-28 border-b border-border/50" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <MiniRoute preview={activity.routePreview as { lat: number; lon: number }[]} />
            </div>
          )}

          <div className="p-4">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-2">
              <Link to={`/user/${feedItem.authorId}`} className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar
                  photoURL={feedItem.authorPhotoURL}
                  displayName={feedItem.authorName}
                  size="lg"
                  fallbackBg={avatarBg}
                  fallbackColor={avatarColor}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-foreground">{feedItem.authorName}</p>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {isRun
                      ? <Footprints className="w-3 h-3" style={{ color: THEME.running }} />
                      : <Dumbbell className="w-3 h-3" style={{ color: THEME.lifting }} />}
                    <p className="text-xs">{timeAgo}</p>
                  </div>
                </div>
              </Link>
              {renderMenuButton()}
            </div>

            {/* Activity title */}
            {activityTitle && <p className="text-sm font-bold text-foreground mb-2">{activityTitle}</p>}

            {/* Summary line (fallback for old activities without title) */}
            {!activityTitle && feedItem.summary && (
              <p className="text-xs text-muted-foreground mb-3">{feedItem.summary}</p>
            )}

            {/* Author caption — optional note attached at share time
                via ShareComposerSheet. Sits between the title and the
                stats so it reads as the author's voice on the activity,
                separate from the auto-generated stat blocks below. */}
            {typeof activity?.caption === 'string' && activity.caption.trim().length > 0 && (
              <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap mb-3">
                {activity.caption}
              </p>
            )}

            {/* Run stats */}
            {isRun && activity && (
              <div className="flex gap-5 mb-3">
                <div>
                  <p className="text-xl font-bold font-mono tabular-nums leading-none" style={{ color: THEME.running }}>
                    {((activity.distance || 0) / 1000).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">km</p>
                </div>
                <div>
                  <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                    {typeof activity.avgPace === 'number' ? formatDur(activity.avgPace) : activity.avgPace || '--:--'}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">/km</p>
                </div>
                {activity.duration && (
                  <div>
                    <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                      {formatDur(activity.duration)}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">time</p>
                  </div>
                )}
                {(activity.elevationGain || 0) > 0 && (
                  <div className="flex items-start gap-1">
                    <Mountain className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                        {activity.elevationGain}m
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">elev</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workout content */}
            {!isRun && activity && <div className="mb-3">{renderWorkoutContent()}</div>}

            {!activity && !feedItem.summary && (
              <p className="text-sm text-muted-foreground mb-3">Activity</p>
            )}
          </div>
        </>
      )}

      <div className="px-4 pb-4">
        {/* PR Highlight */}
        {(feedItem.prHit || activity?.prHit) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
            style={{ background: 'rgba(255, 215, 0, 0.08)', border: '1px solid rgba(255, 215, 0, 0.2)' }}>
            <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
            <p className="text-xs font-medium text-yellow-500">
              New PR: {feedItem.prExercise || activity?.prExercise || 'Personal Record'}{' '}
              {(feedItem.prWeight || activity?.prWeight) ? `${feedItem.prWeight || activity?.prWeight}kg` : ''}
            </p>
          </div>
        )}

        {/* Challenge Milestone */}
        {(feedItem.challengeMilestone || activity?.challengeMilestone) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
            style={{ background: `${THEME.brand}10`, border: `1px solid ${THEME.brand}25` }}>
            <Target className="w-4 h-4 shrink-0" style={{ color: THEME.brand }} />
            <p className="text-xs font-medium" style={{ color: THEME.brand }}>
              {feedItem.challengeMilestone || activity?.challengeMilestone}
            </p>
          </div>
        )}

        {/* Actions — social bar */}
        <div className="flex items-center gap-5 pt-2.5 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleHighFive}
              disabled={liked}
              aria-label={liked ? "Props given" : "Give props"}
              className="p-2 -m-2 transition-transform"
              style={{
                transform: flameAnimating ? 'scale(1.3)' : 'scale(1)',
                transition: 'transform 200ms ease-out',
              }}
            >
              <Flame
                className={`w-5 h-5 ${liked ? 'fill-current' : ''}`}
                style={{ color: liked ? '#F59E0B' : 'var(--color-muted-foreground)', opacity: liked ? 1 : 0.5 }}
              />
            </button>
            {kudosCount > 0 && (
              <button onClick={handleShowKudosList}
                aria-label={`${kudosCount} props — show list`}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                {kudosCount}
              </button>
            )}
          </div>
          <button onClick={() => setShowCommentSheet(true)}
            aria-label="View comments"
            className="flex items-center gap-1.5 p-2 -m-2 text-muted-foreground active:scale-90 transition-transform">
            <MessageCircle className="w-5 h-5" />
            {(activity?.commentCount ?? 0) > 0 && (
              <span className="text-xs font-medium">{activity!.commentCount}</span>
            )}
          </button>
          {canSaveRoutine && (
            <button
              onClick={() => setShowSaveRoutine(true)}
              aria-label="Save as routine"
              className="p-2 -m-2 text-muted-foreground active:scale-90 transition-transform"
            >
              <BookmarkPlus className="w-5 h-5" />
            </button>
          )}
          {onShare && (
            <button onClick={() => onShare(feedItem)}
              aria-label="Share activity"
              className="ml-auto p-2 -m-2 text-muted-foreground active:scale-90 transition-transform">
              <Share2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Kudos list popup */}
        {showKudosList && (
          <div className="mt-2 p-3 rounded-xl bg-muted space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Props from</p>
            {kudosLoading ? (
              <div className="flex items-center justify-center py-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : kudosUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Couldn&apos;t load props right now. Try again.</p>
            ) : kudosUsers.map(u => (
              <div key={u.userId} className="flex items-center gap-2">
                <Avatar photoURL={u.photoURL} displayName={u.userName} size="sm" />
                <span className="text-xs font-medium text-foreground">{u.userName}</span>
              </div>
            ))}
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
          defaultName={(activity?.workoutName as string | undefined) || activityTitle || "Saved routine"}
          sourceActivityId={feedItem.activityId}
          sourceAuthorId={(activity?.authorId as string) || ""}
          sourceAuthorName={feedItem.authorName || "Athlete"}
          sourceWorkoutName={(activity?.workoutName as string | undefined)}
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
          haptic('heavy');
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
        <button onClick={() => setShowMenu(!showMenu)}
          aria-label="More options" aria-expanded={showMenu}
          className="p-2.5 rounded-lg hover:bg-muted transition-colors">
          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" role="presentation" aria-hidden="true" onClick={() => setShowMenu(false)} />
            <div
              className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-44"
              role="menu"
              tabIndex={-1}
              ref={(el) => el?.focus()}
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowMenu(false); } }}
            >
              <button
                role="menuitem"
                onClick={() => { setShowMenu(false); setShowReport(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Flag className="w-4 h-4 text-muted-foreground" />
                Report activity
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setShowMenu(false);
                  setShowBlockConfirm(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
              >
                <Ban className="w-4 h-4" />
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
