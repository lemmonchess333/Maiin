import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { toggleKudos, hasGivenKudos, getActivity } from '../../lib/socialApi';
import CommentSection from './CommentSection';
import type { FeedItem } from '../../hooks/useSocialFeed';

function getTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityCard({ feedItem }: { feedItem: FeedItem }) {
  const { user } = useAuth();
  const [activity, setActivity] = useState<any>(null);
  const [liked, setLiked] = useState(false);
  const [kudosCount, setKudosCount] = useState(0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    getActivity(feedItem.activityId).then(a => {
      if (a) { setActivity(a); setKudosCount((a as any).kudosCount || 0); }
    });
    if (user) hasGivenKudos(feedItem.activityId, user.uid).then(setLiked);
  }, [feedItem.activityId, user]);

  const handleKudos = async () => {
    if (!user) return;
    const nowLiked = await toggleKudos(feedItem.activityId, user.uid);
    setLiked(nowLiked);
    setKudosCount(c => nowLiked ? c + 1 : c - 1);
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const isRun = feedItem.type === 'run';
  const timeAgo = feedItem.createdAt?.toDate ? getTimeAgo(feedItem.createdAt.toDate()) : '';

  return (
    <div className="p-4 bg-card rounded-2xl border border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
          isRun ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
        }`}>
          {feedItem.authorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{feedItem.authorName}</p>
          <p className="text-[10px] text-muted-foreground">
            {timeAgo} · {isRun ? '🏃 Run' : '🏋️ Workout'}
          </p>
        </div>
      </div>

      <p className="text-sm mb-3">{feedItem.summary}</p>

      {isRun && activity?.routePreview && activity.routePreview.length > 1 && (
        <div className="mb-3 h-24 bg-muted rounded-lg overflow-hidden">
          <svg viewBox="0 0 200 80" className="w-full h-full p-2" preserveAspectRatio="xMidYMid meet">
            <polyline fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"
              points={(() => {
                const pts = activity.routePreview;
                const lats = pts.map((p: any) => p.lat);
                const lons = pts.map((p: any) => p.lon);
                const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                const minLon = Math.min(...lons), maxLon = Math.max(...lons);
                const rangeLat = maxLat - minLat || 0.001;
                const rangeLon = maxLon - minLon || 0.001;
                return pts.map((p: any) =>
                  `${((p.lon - minLon) / rangeLon) * 190 + 5},${(1 - (p.lat - minLat) / rangeLat) * 70 + 5}`
                ).join(' ');
              })()}
            />
          </svg>
        </div>
      )}

      {!isRun && activity?.muscleGroups && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {activity.muscleGroups.map((mg: string) => (
            <span key={mg} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">{mg}</span>
          ))}
          {(activity.prsHit || 0) > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              🏆 {activity.prsHit} PR{activity.prsHit > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 pt-2 border-t border-border/50">
        <button onClick={handleKudos} className="flex items-center gap-1.5">
          <span className={liked ? 'text-orange-500' : 'text-muted-foreground'}>{liked ? '🧡' : '🤍'}</span>
          {kudosCount > 0 && <span className="text-xs text-muted-foreground">{kudosCount}</span>}
        </button>
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 text-muted-foreground">
          💬 {(activity?.commentCount || 0) > 0 && <span className="text-xs">{activity.commentCount}</span>}
        </button>
      </div>

      {showComments && <CommentSection activityId={feedItem.activityId} />}
    </div>
  );
}
