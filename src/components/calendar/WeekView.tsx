import SessionCard from './SessionCard';

interface TrainingSession {
  id: string;
  date: string;
  type: 'run' | 'lift';
  status: 'scheduled' | 'completed' | 'skipped';
  runTemplateName?: string;
  liftProgramDay?: string;
}

interface Day {
  date: string;
  label: string;
  dayNum: number;
  isToday: boolean;
}

interface WeekViewProps {
  weekDays: Day[];
  sessions: TrainingSession[];
  onAdd: (date: string) => void;
  onStart: (session: TrainingSession) => void;
  onSkip: (sessionId: string) => void;
}

export default function WeekView({ weekDays, sessions, onAdd, onStart, onSkip }: WeekViewProps) {
  const getSessionsForDate = (date: string) => sessions.filter((s) => s.date === date);

  return (
    <div className="space-y-2">
      {weekDays.map((day) => {
        const daySessions = getSessionsForDate(day.date);
        return (
          <div
            key={day.date}
            className={`p-3 rounded-xl border ${
              day.isToday ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/10' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${day.isToday ? 'text-purple-600' : 'text-muted-foreground'}`}>
                  {day.label}
                </span>
                <span className="text-xs text-muted-foreground">{day.dayNum}</span>
              </div>
              <button onClick={() => onAdd(day.date)} className="text-xs text-purple-500 font-medium">
                + Add
              </button>
            </div>

            {daySessions.length === 0 && <p className="text-[10px] text-muted-foreground italic">Rest day</p>}
            {daySessions.map((session) => (
              <SessionCard
                key={session.id}
                type={session.type}
                title={session.type === 'run' ? session.runTemplateName || 'Run' : session.liftProgramDay || 'Workout'}
                status={session.status}
                onStart={() => onStart(session)}
                onSkip={() => onSkip(session.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
