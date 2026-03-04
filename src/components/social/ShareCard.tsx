import { forwardRef } from 'react';

export interface ShareCardData {
  type: 'run' | 'workout' | 'badge' | 'pr' | 'weekly_summary' | 'streak';
  userName: string;
  date: string;
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
}

const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(({ data }, ref) => {
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={ref}
      style={{ width: 1080, height: 1920, position: 'absolute', left: -9999, top: -9999 }}
      className="bg-gray-950 text-white flex flex-col items-center justify-center p-16">
      {/* Brand header */}
      <p className="text-4xl font-bold tracking-tight mb-1" style={{ color: '#a78bfa' }}>MAIIN</p>
      <p className="text-lg text-white/30 mb-16">Adaptive Fitness</p>

      {/* Run card */}
      {data.type === 'run' && (
        <>
          <p className="text-8xl mb-10">🏃</p>
          <div className="text-center space-y-8">
            <div>
              <p className="text-9xl font-bold font-mono">{((data.distance || 0) / 1000).toFixed(2)}</p>
              <p className="text-2xl text-white/40">kilometres</p>
            </div>
            <div className="flex gap-20 justify-center">
              <div className="text-center">
                <p className="text-5xl font-bold font-mono">{data.pace || '--:--'}</p>
                <p className="text-lg text-white/40">/km pace</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-bold font-mono">{data.duration ? formatDuration(data.duration) : '--'}</p>
                <p className="text-lg text-white/40">time</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Workout card */}
      {data.type === 'workout' && (
        <>
          <p className="text-8xl mb-10">🏋️</p>
          <div className="text-center space-y-8">
            <div>
              <p className="text-9xl font-bold font-mono">
                {data.totalVolume ? `${(data.totalVolume / 1000).toFixed(1)}t` : '0'}
              </p>
              <p className="text-2xl text-white/40">total volume</p>
            </div>
            <div className="flex gap-20 justify-center">
              <div className="text-center">
                <p className="text-5xl font-bold">{data.exerciseCount || 0}</p>
                <p className="text-lg text-white/40">exercises</p>
              </div>
              {(data.prsHit || 0) > 0 && (
                <div className="text-center">
                  <p className="text-5xl font-bold text-yellow-400">🏆 {data.prsHit}</p>
                  <p className="text-lg text-white/40">PRs</p>
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
            <p className="text-2xl text-white/40 mt-2">{data.badgeDescription}</p>
          </div>
          <p className="text-3xl text-yellow-400 font-bold">Badge Earned!</p>
        </div>
      )}

      {/* PR card */}
      {data.type === 'pr' && (
        <div className="text-center space-y-6">
          <p className="text-8xl mb-4">🏆</p>
          <p className="text-4xl font-bold">{data.exerciseName}</p>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-4xl text-white/40 font-mono">{data.oldWeight}kg</p>
              <p className="text-lg text-white/30">before</p>
            </div>
            <p className="text-4xl text-white/30">→</p>
            <div className="text-center">
              <p className="text-6xl font-bold text-yellow-400 font-mono">{data.newWeight}kg</p>
              <p className="text-lg text-white/30">NEW PR</p>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {data.type === 'weekly_summary' && (
        <div className="text-center space-y-8">
          <p className="text-4xl font-bold">Weekly Wrap-Up</p>
          <div className="grid grid-cols-2 gap-12">
            <div className="text-center">
              <p className="text-6xl font-bold font-mono" style={{ color: '#6C7CFF' }}>{data.weekSessions || 0}</p>
              <p className="text-xl text-white/40">sessions</p>
            </div>
            <div className="text-center">
              <p className="text-6xl font-bold font-mono" style={{ color: '#FF6B6B' }}>{data.weekKm?.toFixed(1) || '0'}km</p>
              <p className="text-xl text-white/40">distance</p>
            </div>
            <div className="text-center">
              <p className="text-6xl font-bold font-mono" style={{ color: '#34D399' }}>{data.weekTonnage ? (data.weekTonnage / 1000).toFixed(1) + 't' : '0'}</p>
              <p className="text-xl text-white/40">tonnage</p>
            </div>
            <div className="text-center">
              <p className="text-6xl font-bold font-mono text-orange-400">🔥 {data.weekStreak || 0}</p>
              <p className="text-xl text-white/40">streak</p>
            </div>
          </div>
        </div>
      )}

      {/* Streak card */}
      {data.type === 'streak' && (
        <div className="text-center space-y-6">
          <p className="text-[120px]">🔥</p>
          <p className="text-8xl font-bold text-orange-400 font-mono">{data.streakCount}</p>
          <p className="text-3xl text-white/40">day streak</p>
        </div>
      )}

      {/* Gradient accent bar */}
      <div className="mt-auto w-full space-y-6">
        <div className="h-1 w-full rounded-full" style={{ background: 'linear-gradient(to right, #8b5cf6, #6366f1)' }} />
        <p className="text-xl text-white/20 text-center">{data.userName} · {data.date}</p>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
export default ShareCard;
