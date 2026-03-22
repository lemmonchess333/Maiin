import { Footprints, Dumbbell } from 'lucide-react';
import { THEME } from '@/lib/theme';

interface SessionCardProps {
  type: 'run' | 'lift';
  title: string;
  status: 'scheduled' | 'completed' | 'skipped';
  onStart: () => void;
  onSkip: () => void;
}

export default function SessionCard({ type, title, status, onStart, onSkip }: SessionCardProps) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-xl mb-1 ${
        status === 'completed'
          ? 'bg-green-50 dark:bg-green-950/10'
          : status === 'skipped'
            ? 'bg-muted/50 opacity-50'
            : 'bg-muted/30'
      }`}
    >
      {type === 'run' ? <Footprints size={16} style={{ color: THEME.running }} /> : <Dumbbell size={16} style={{ color: THEME.lifting }} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
      </div>
      {status === 'completed' ? (
        <span className="text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center" style={{ color: THEME.success, backgroundColor: THEME.success + '18' }}>✓</span>
      ) : (
        <div className="flex gap-1">
          <button onClick={onStart} className="text-[11px] px-2.5 py-1 rounded-lg text-white" style={{ backgroundColor: THEME.brand }}>
            Start
          </button>
          <button onClick={onSkip} className="text-[11px] px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
