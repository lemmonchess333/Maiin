import { forwardRef } from 'react';

interface ShareCardData {
  type: 'run' | 'workout';
  userName: string;
  date: string;
  distance?: number;
  duration?: number;
  pace?: string;
  elevationGain?: number;
  exerciseCount?: number;
  totalVolume?: number;
  prsHit?: number;
  muscleGroups?: string[];
}

const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(({ data }, ref) => {
  const isRun = data.type === 'run';
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={ref}
      style={{ width: 1080, height: 1920, position: 'absolute', left: -9999, top: -9999 }}
      className="bg-gray-950 text-white flex flex-col items-center justify-center p-16">
      <p className="text-4xl font-bold tracking-tight mb-1" style={{ color: '#a78bfa' }}>MAIIN</p>
      <p className="text-lg text-white/30 mb-16">Adaptive Fitness</p>
      <p className="text-8xl mb-10">{isRun ? '🏃' : '🏋️'}</p>

      {isRun ? (
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
      ) : (
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
      )}

      <div className="mt-auto text-center">
        <p className="text-xl text-white/20">{data.userName} · {data.date}</p>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
export default ShareCard;
