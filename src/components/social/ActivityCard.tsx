import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { toggleKudos, getKudosList, writeNotification } from '../../lib/socialApi';
import CommentSection from './CommentSection';
import type { FeedItem } from '../../hooks/useSocialFeed';
import { THEME } from '../../lib/theme';
import { MessageCircle, Dumbbell, Footprints, Trophy, Mountain, Share2, Target } from 'lucide-react';

function getTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

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
    <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
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

export default function ActivityCard({ feedItem, onShare }: { feedItem: FeedItem; onShare?: (item: FeedItem) => void }) {
  const { user, profile } = useAuth();
  const [liked, setLiked] = useState(feedItem.liked ?? false);
  const [kudosCount, setKudosCount] = useState(feedItem.kudosCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [kudosAnimating, setKudosAnimating] = useState(false);
  const [showKudosList, setShowKudosList] = useState(false);
  const [kudosUsers, setKudosUsers] = useState<{ userId: string; userName: string }[]>([]);
  const activity = feedItem.activity;

  const handleKudos = async () => {
    if (!user) return;
    // Optimistic UI
    const willLike = !liked;
    setLiked(willLike);
    setKudosCount(c => willLike ? c + 1 : c - 1);
    // Animate
    setKudosAnimating(true);
    setTimeout(() => setKudosAnimating(false), 400);
    if (navigator.vibrate) navigator.vibrate(30);

    const nowLiked = await toggleKudos(feedItem.activityId, user.uid);
    // Reconcile if server disagrees
    if (nowLiked !== willLike) {
      setLiked(nowLiked);
      setKudosCount(feedItem.kudosCount ?? 0);
    }
    // Notify activity author on kudos give
    if (nowLiked && activity?.authorId && activity.authorId !== user.uid) {
      writeNotification(activity.authorId, {
        type: 'kudos',
        fromUserId: user.uid,
        fromName: profile?.displayName || 'Someone',
        activityId: feedItem.activityId,
        message: `${profile?.displayName || 'Someone'} gave you props on your ${feedItem.type}`,
      }).catch(() => {});
    }
  };

  const handleShowKudosList = async () => {
    if (kudosCount === 0) return;
    if (showKudosList) { setShowKudosList(false); return; }
    const users = await getKudosList(feedItem.activityId);
    setKudosUsers(users);
    setShowKudosList(true);
  };

  const isRun = feedItem.type === 'run';
  const timeAgo = feedItem.createdAt?.toDate ? getTimeAgo(feedItem.createdAt.toDate()) : '';
  const avatarBg = isRun ? `${THEME.running}20` : `${THEME.lifting}20`;
  const avatarColor = isRun ? THEME.running : THEME.lifting;
  const chips = isRun ? RUN_CHIPS : LIFT_CHIPS;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Route thumbnail for runs */}
      {isRun && activity?.routePreview?.length > 1 && (
        <div className="h-28 border-b border-border/50" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <MiniRoute preview={activity.routePreview} />
        </div>
      )}

      <div className="p-4">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: avatarBg, color: avatarColor }}>
            {feedItem.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{feedItem.authorName}</p>
            <div className="flex items-center gap-1 text-muted-foreground">
              {isRun
                ? <Footprints className="w-3 h-3" style={{ color: THEME.running }} />
                : <Dumbbell className="w-3 h-3" style={{ color: THEME.lifting }} />}
              <p className="text-[10px]">{timeAgo}</p>
            </div>
          </div>
        </div>

        {/* Summary line */}
        <p className="text-xs text-muted-foreground mb-3">{feedItem.summary}</p>

        {/* Run stats */}
        {isRun && activity && (
          <div className="flex gap-5 mb-3">
            <div>
              <p className="text-xl font-bold font-mono tabular-nums leading-none" style={{ color: THEME.running }}>
                {((activity.distance || 0) / 1000).toFixed(2)}
              </p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">km</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                {typeof activity.avgPace === 'number' ? formatDur(activity.avgPace) : activity.avgPace || '--:--'}
              </p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">/km</p>
            </div>
            {activity.duration && (
              <div>
                <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                  {formatDur(activity.duration)}
                </p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">time</p>
              </div>
            )}
            {(activity.elevationGain || 0) > 0 && (
              <div className="flex items-start gap-1">
                <Mountain className="w-3.5 h-3.5 text-muted-foreground mt-1" />
                <div>
                  <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
                    {activity.elevationGain}m
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">elev</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Workout stats */}
        {!isRun && activity && (
          <div className="space-y-2 mb-3">
            {/* Muscle groups */}
            {activity.muscleGroups && (
              <div className="flex flex-wrap gap-1.5">
                {activity.muscleGroups.map((mg: string) => (
                  <span key={mg} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${THEME.lifting}15`, color: THEME.lifting }}>
                    {mg}
                  </span>
                ))}
              </div>
            )}
            {/* Workout volume/duration */}
            <div className="flex gap-4">
              {activity.totalVolume > 0 && (
                <div>
                  <p className="text-lg font-bold font-mono tabular-nums leading-none" style={{ color: THEME.lifting }}>
                    {Math.round(activity.totalVolume).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">kg volume</p>
                </div>
              )}
              {activity.exerciseCount > 0 && (
                <div>
                  <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                    {activity.exerciseCount}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">exercises</p>
                </div>
              )}
              {activity.duration > 0 && (
                <div>
                  <p className="text-lg font-bold font-mono tabular-nums leading-none text-foreground">
                    {Math.round(activity.duration / 60)}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">min</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!activity && !feedItem.summary && (
          <p className="text-sm text-muted-foreground mb-3">Activity</p>
        )}

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

        {/* Actions */}
        <div className="flex items-center gap-5 pt-2.5 border-t border-border/40">
          <button onClick={handleKudos}
            className="flex items-center gap-1.5 transition-transform"
            style={kudosAnimating ? { animation: 'kudos-pop 0.4s ease-out' } : undefined}>
            <Dumbbell size={16} style={{ filter: liked ? "none" : "grayscale(1) opacity(0.5)" }} />
            {kudosCount > 0 && (
              <button onClick={(e) => { e.stopPropagation(); handleShowKudosList(); }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                {kudosCount}
              </button>
            )}
          </button>
          <button onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-muted-foreground active:scale-90 transition-transform">
            <MessageCircle className="w-5 h-5" />
            {(activity?.commentCount || 0) > 0 && (
              <span className="text-xs font-medium">{activity.commentCount}</span>
            )}
          </button>
          {onShare && (
            <button onClick={() => onShare(feedItem)}
              className="ml-auto text-muted-foreground active:scale-90 transition-transform">
              <Share2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Kudos list popup */}
        {showKudosList && kudosUsers.length > 0 && (
          <div className="mt-2 p-3 rounded-xl bg-muted border border-border/50 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Props from</p>
            {kudosUsers.map(u => (
              <div key={u.userId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {u.userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-foreground">{u.userName}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quick reply chips */}
        {showComments && (
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(`[data-comment-input="${feedItem.activityId}"]`);
                  if (input) { input.value = chip; input.dispatchEvent(new Event('input', { bubbles: true })); }
                }}
                className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors active:scale-95"
                style={{ background: `${THEME.brand}15`, color: THEME.brand }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {showComments && <CommentSection activityId={feedItem.activityId} activityAuthorId={activity?.authorId} />}
      </div>

      <style>{`
        @keyframes kudos-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
