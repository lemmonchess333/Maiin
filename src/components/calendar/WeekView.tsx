import SessionCard from './SessionCard';
import { THEME } from '@/lib/theme';
import { Check } from 'lucide-react';

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

interface ScheduleDay {
  day: number;
  type: string;
}

interface WeekViewProps {
  weekDays: Day[];
  sessions: TrainingSession[];
  weekSchedule?: ScheduleDay[];
  onAdd: (date: string) => void;
  onStart: (session: TrainingSession) => void;
  onSkip: (sessionId: string) => void;
}

export default function WeekView({ weekDays, sessions, weekSchedule, onAdd, onStart, onSkip }: WeekViewProps) {
  const getSessionsForDate = (date: string) => sessions.filter((s) => s.date === date);

  const getScheduledType = (date: string) => {
    if (!weekSchedule || weekSchedule.length === 0) return null;
    const dow = new Date(date + "T12:00:00").getDay();
    const entry = weekSchedule.find((s) => s.day === dow);
    return entry?.type || null;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-2">
      {weekDays.map((day) => {
        const daySessions = getSessionsForDate(day.date);
        const scheduledType = getScheduledType(day.date);
        const isLiftDay = scheduledType === 'lift';
        const isRunDay = scheduledType === 'run';
        const isPast = new Date(day.date + 'T00:00:00') < today && !day.isToday;
        const hasCompletedActivity = daySessions.some((s) => s.status === 'completed');
        const isRestDay = !isLiftDay && !isRunDay;
        return (
          <div
            key={day.date}
            className={`p-3 rounded-xl border ${
              day.isToday ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/10' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${day.isToday ? 'text-purple-600' : (isPast && isRestDay && !hasCompletedActivity) ? 'text-muted-foreground/50' : (!isLiftDay && !isRunDay && daySessions.length === 0) ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                  {day.label}
                </span>
                <span className={`text-xs ${(isPast && isRestDay && !hasCompletedActivity) ? 'text-muted-foreground/50' : (!isLiftDay && !isRunDay && daySessions.length === 0) ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{day.dayNum}</span>
                {/* Completed: show checkmark in sport colour instead of dot */}
                {isPast && hasCompletedActivity && isLiftDay && (
                  <Check className="w-3.5 h-3.5" style={{ color: THEME.calendar.liftDay }} strokeWidth={3} />
                )}
                {isPast && hasCompletedActivity && isRunDay && (
                  <Check className="w-3.5 h-3.5" style={{ color: THEME.calendar.runDay }} strokeWidth={3} />
                )}
                {isPast && hasCompletedActivity && isRestDay && (
                  <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
                )}
                {/* Scheduled but not completed (or future): show dot */}
                {!(isPast && hasCompletedActivity) && daySessions.length === 0 && isLiftDay && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: THEME.calendar.liftDay }} title="Lift day" />
                )}
                {!(isPast && hasCompletedActivity) && daySessions.length === 0 && isRunDay && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: THEME.calendar.runDay }} title="Run day" />
                )}
              </div>
              <button onClick={() => onAdd(day.date)} className="text-xs text-purple-500 font-medium">
                + Add
              </button>
            </div>

            {daySessions.length === 0 && (
              <p className={`text-[10px] italic ${(isLiftDay || isRunDay) ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                {isLiftDay ? 'Lift day' : isRunDay ? 'Run day' : 'Rest day'}
              </p>
            )}
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
