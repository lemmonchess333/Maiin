import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { toggleKudos } from '../../lib/socialApi';
import CommentSection from './CommentSection';
import type { FeedItem } from '../../hooks/useSocialFeed';
import { THEME } from '../../lib/theme';
import { Heart, MessageCircle, Dumbbell, Footprints, Trophy, TrendingUp, Mountain } from 'lucide-react';

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

const RUN_CHIPS = ['Nice run! 🏃', 'Great pace! ⚡', 'Keep it up! 💪'];
const LIFT_CHIPS = ['Great lift! 🏋️', 'Beast mode! 💪', 'Strong work! 🔥'];

export default function ActivityCard({ feedItem }: { feedItem: FeedItem }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(feedItem.liked ?? false);
  const [kudosCount, setKudosCount] = useState(feedItem.kudosCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const activity = feedItem.activity;

  const handleKudos = async () => {
    if (!user) return;
    const nowLiked = await toggleKudos(feedItem.activityId, user.uid);
    setLiked(nowLiked);
    setKudosCount(c => nowLiked ? c + 1 : c - 1);
    if (navigator.vibrate) navigator.vibrate(30);
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
              <p className="text-[10px]">{timeAgo} · {isRun ? 'Run' : 'Workout'}</p>
            </div>
          </div>
        </div>

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
                {activity.avgPace || '--:--'}
              </p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">/km</p>
            </div>
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

        {/* Workout muscle groups + PRs */}
        {!isRun && activity?.muscleGroups && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {activity.muscleGroups.map((mg: string) => (
              <span key={mg} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${THEME.lifting}15`, color: THEME.lifting }}>
                {mg}
              </span>
            ))}
            {(activity.prsHit || 0) > 0 && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 font-medium">
                <Trophy className="w-3 h-3" />
                {activity.prsHit} PR{activity.prsHit > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {!activity && (
          <p className="text-sm text-muted-foreground mb-3">{feedItem.summary}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-5 pt-2.5 border-t border-border/40">
          <button onClick={handleKudos}
            className="flex items-center gap-1.5 active:scale-90 transition-transform">
            <Heart
              className="w-5 h-5 transition-colors"
              style={{ color: liked ? '#EF4444' : undefined }}
              fill={liked ? '#EF4444' : 'none'}
              stroke={liked ? '#EF4444' : 'currentColor'}
            />
            {kudosCount > 0 && (
              <span className="text-xs font-medium text-muted-foreground">{kudosCount}</span>
            )}
          </button>
          <button onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-muted-foreground active:scale-90 transition-transform">
            <MessageCircle className="w-5 h-5" />
            {(activity?.commentCount || 0) > 0 && (
              <span className="text-xs font-medium">{activity.commentCount}</span>
            )}
          </button>
          {isRun && activity && (
            <div className="ml-auto flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px]">{activity.splits?.length ?? 0} splits</span>
            </div>
          )}
        </div>

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

        {showComments && <CommentSection activityId={feedItem.activityId} />}
      </div>
    </div>
  );
}