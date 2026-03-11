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
      className={`flex items-center gap-3 p-2 rounded-lg mb-1 ${
        status === 'completed'
          ? 'bg-green-50 dark:bg-green-950/10'
          : status === 'skipped'
            ? 'bg-muted/50 opacity-50'
            : 'bg-muted/30'
      }`}
    >
      <span className="text-lg">{type === 'run' ? '🏃' : '🏋️'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
      </div>
      {status === 'completed' ? (
        <span className="text-green-500 text-sm font-bold bg-green-100 dark:bg-green-900/30 rounded-full w-6 h-6 flex items-center justify-center">✓</span>
      ) : (
        <div className="flex gap-1">
          <button onClick={onStart} className="text-[10px] px-2 py-1 rounded bg-purple-500 text-white">
            Start
          </button>
          <button onClick={onSkip} className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground">
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
