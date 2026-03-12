import { forwardRef } from 'react';
import { getDistanceComparison, getVolumeComparison } from '@/lib/funComparisons';

export type ShareCardTheme = 'dark' | 'light' | 'transparent';

export interface ShareCardData {
  type: 'run' | 'workout' | 'badge' | 'pr' | 'weekly_summary' | 'streak';
  userName: string;
  date: string;
  theme?: ShareCardTheme;
  // Run
  distance?: number;
  duration?: number;
  pace?: string;
  elevationGain?: number;
  // Workout
  exerciseCount?: number;
  totalVolume?: number;
  prsHit?: number;
  muscleGroups?: string[];
  // Badge
  badgeIcon?: string;
  badgeName?: string;
  badgeDescription?: string;
  // PR
  exerciseName?: string;
  oldWeight?: number;
  newWeight?: number;
  // Weekly Summary
  weekSessions?: number;
  weekKm?: number;
  weekTonnage?: number;
  weekStreak?: number;
  // Streak
  streakCount?: number;
  // Stat visibility
  hiddenStats?: Set<string>;
}

const THEME_STYLES: Record<ShareCardTheme, { bg: string; text: string; muted: string; accent: string }> = {
  dark: { bg: '#0a0a0f', text: '#ffffff', muted: 'rgba(255,255,255,0.4)', accent: '#a78bfa' },
  light: { bg: '#ffffff', text: '#1a1a2e', muted: 'rgba(0,0,0,0.4)', accent: '#8b5cf6' },
  transparent: { bg: 'transparent', text: '#ffffff', muted: 'rgba(255,255,255,0.4)', accent: '#a78bfa' },
};

const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(({ data }, ref) => {
  const theme = data.theme || 'dark';
  const s = THEME_STYLES[theme];
  const hidden = data.hiddenStats || new Set();

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const distKm = data.distance ? data.distance / 1000 : 0;
  const comparison = data.type === 'run' && distKm > 0
    ? getDistanceComparison(distKm)
    : data.type === 'workout' && (data.totalVolume || 0) > 0
    ? getVolumeComparison(data.totalVolume || 0)
    : null;

  return (
    <div ref={ref}
      style={{ width: 1080, height: 1920, position: 'absolute', left: -9999, top: -9999, backgroundColor: s.bg, color: s.text }}
      className="flex flex-col items-center justify-center p-16">

      {/* Brand header */}
      <p className="text-4xl font-bold tracking-tight mb-1" style={{ color: s.accent }}>TROPOS</p>
      <p className="text-lg mb-16" style={{ color: s.muted }}>Tracked with Tropos</p>

      {/* Run card */}
      {data.type === 'run' && (
        <>
          <p className="text-8xl mb-10">🏃</p>
          <div className="text-center space-y-8">
            {!hidden.has('distance') && (
              <div>
                <p className="text-9xl font-bold font-mono">{distKm.toFixed(2)}</p>
                <p className="text-2xl" style={{ color: s.muted }}>kilometres</p>
              </div>
            )}
            <div className="flex gap-20 justify-center">
              {!hidden.has('pace') && (
                <div className="text-center">
                  <p className="text-5xl font-bold font-mono">{data.pace || '--:--'}</p>
                  <p className="text-lg" style={{ color: s.muted }}>/km pace</p>
                </div>
              )}
              {!hidden.has('duration') && (
                <div className="text-center">
                  <p className="text-5xl font-bold font-mono">{data.duration ? formatDuration(data.duration) : '--'}</p>
                  <p className="text-lg" style={{ color: s.muted }}>time</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Workout card */}
      {data.type === 'workout' && (
        <>
          <p className="text-8xl mb-10">🏋️</p>
          <div className="text-center space-y-8">
            {!hidden.has('volume') && (
              <div>
                <p className="text-9xl font-bold font-mono">
                  {data.totalVolume ? `${(data.totalVolume / 1000).toFixed(1)}t` : '0'}
                </p>
                <p className="text-2xl" style={{ color: s.muted }}>total volume</p>
              </div>
            )}
            <div className="flex gap-20 justify-center">
              {!hidden.has('exercises') && (
                <div className="text-center">
                  <p className="text-5xl font-bold">{data.exerciseCount || 0}</p>
                  <p className="text-lg" style={{ color: s.muted }}>exercises</p>
                </div>
              )}
              {!hidden.has('prs') && (data.prsHit || 0) > 0 && (
                <div className="text-center">
                  <p className="text-5xl font-bold" style={{ color: '#facc15' }}>🏆 {data.prsHit}</p>
                  <p className="text-lg" style={{ color: s.muted }}>PRs</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Badge card */}
      {data.type === 'badge' && (
        <div className="text-center space-y-6">
          <p className="text-[120px]">{data.badgeIcon || '🏅'}</p>
          <div>
            <p className="text-5xl font-bold">{data.badgeName}</p>
            <p className="text-2xl mt-2" style={{ color: s.muted }}>{data.badgeDescription}</p>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#facc15' }}>Badge Earned!</p>
        </div>
      )}

      {/* PR card */}
      {data.type === 'pr' && (
        <div className="text-center space-y-6">
          <p className="text-8xl mb-4">🏆</p>
          <p className="text-4xl font-bold">{data.exerciseName}</p>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-4xl font-mono" style={{ color: s.muted }}>{data.oldWeight}kg</p>
              <p className="text-lg" style={{ color: s.muted }}>before</p>
            </div>
            <p className="text-4xl" style={{ color: s.muted }}>→</p>
            <div className="text-center">
              <p className="text-6xl font-bold font-mono" style={{ color: '#facc15' }}>{data.newWeight}kg</p>
              <p className="text-lg" style={{ color: s.muted }}>NEW PR</p>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {data.type === 'weekly_summary' && (
        <div className="text-center space-y-8">
          <p className="text-4xl font-bold">Weekly Wrap-Up</p>
          <div className="grid grid-cols-2 gap-12">
            {!hidden.has('sessions') && (
              <div className="text-center">
                <p className="text-6xl font-bold font-mono" style={{ color: '#6C7CFF' }}>{data.weekSessions || 0}</p>
                <p className="text-xl" style={{ color: s.muted }}>sessions</p>
              </div>
            )}
            {!hidden.has('distance') && (
              <div className="text-center">
                <p className="text-6xl font-bold font-mono" style={{ color: '#FF6B6B' }}>{data.weekKm?.toFixed(1) || '0'}km</p>
                <p className="text-xl" style={{ color: s.muted }}>distance</p>
              </div>
            )}
            {!hidden.has('tonnage') && (
              <div className="text-center">
                <p className="text-6xl font-bold font-mono" style={{ color: '#34D399' }}>{data.weekTonnage ? (data.weekTonnage / 1000).toFixed(1) + 't' : '0'}</p>
                <p className="text-xl" style={{ color: s.muted }}>tonnage</p>
              </div>
            )}
            {!hidden.has('streak') && (
              <div className="text-center">
                <p className="text-6xl font-bold font-mono" style={{ color: '#f97316' }}>🔥 {data.weekStreak || 0}</p>
                <p className="text-xl" style={{ color: s.muted }}>streak</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Streak card */}
      {data.type === 'streak' && (
        <div className="text-center space-y-6">
          <p className="text-[120px]">🔥</p>
          <p className="text-8xl font-bold font-mono" style={{ color: '#f97316' }}>{data.streakCount}</p>
          <p className="text-3xl" style={{ color: s.muted }}>day streak</p>
        </div>
      )}

      {/* Fun comparison */}
      {comparison && (
        <p className="text-2xl mt-12 text-center italic" style={{ color: s.muted }}>
          {comparison}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto w-full space-y-6">
        <div className="h-1 w-full rounded-full" style={{ background: `linear-gradient(to right, ${s.accent}, #6366f1)` }} />
        <p className="text-xl text-center" style={{ color: s.muted }}>{data.userName} · {data.date}</p>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
export default ShareCard;
