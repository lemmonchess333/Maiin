import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { RUN_TEMPLATES, type RunTemplate } from '../lib/workoutTemplates';
import { generateSchedule } from '../lib/scheduleUtils';
import { useProgram } from '../features/program/useProgram';
import WeekView from '../components/calendar/WeekView';

interface TrainingSession {
  id: string;
  date: string;
  dayOfWeek: number;
  type: 'run' | 'lift';
  status: 'scheduled' | 'completed' | 'skipped';
  runTemplateId?: string;
  runTemplateName?: string;
  liftProgramDay?: string;
}

export default function TrainingCalendar() {
  const { user, profile } = useAuth();
  const { programState } = useProgram();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(function() {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() - ((dow + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weekEnd = new Date(currentWeekStart.getTime() + 6 * 86400000);
  const weekStartStr = currentWeekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const loadSessions = useCallback(async function() {
    if (!user) return;

    // 1. Load manually planned sessions
    const ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
    const snap = await getDocs(query(ref, orderBy('date')));
    const planned = snap.docs.map(function(d) { return { id: d.id, ...d.data() } as TrainingSession; });

    // 2. Load completed workouts in this week range
    const workoutsRef = collection(db, 'users', user.uid, 'workouts');
    const wSnap = await getDocs(query(workoutsRef, where('date', '>=', weekStartStr), where('date', '<=', weekEndStr)));
    const autoWorkouts: TrainingSession[] = [];
    wSnap.docs.forEach(function(d) {
      const data = d.data();
      const date = data.date as string;
      // Skip if there is already a planned session for this date and type
      const alreadyPlanned = planned.some(function(p) { return p.date === date && p.type === 'lift'; });
      if (!alreadyPlanned) {
        // Get first exercise name as label
        const exercises = data.exercises || [];
        const label = exercises.length > 0 ? exercises[0].exerciseName || 'Workout' : 'Workout';
        autoWorkouts.push({
          id: 'auto-lift-' + d.id,
          date: date,
          dayOfWeek: new Date(date + 'T00:00:00').getDay(),
          type: 'lift',
          status: 'completed',
          liftProgramDay: label,
        });
      }
    });

    // 3. Load completed runs in this week range
    const runsRef = collection(db, 'users', user.uid, 'runs');
    const startTs = Timestamp.fromDate(currentWeekStart);
    const endTs = Timestamp.fromDate(new Date(weekEnd.getTime() + 86400000));
    const rSnap = await getDocs(query(runsRef, where('completedAt', '>=', startTs), where('completedAt', '<=', endTs), orderBy('completedAt')));
    const autoRuns: TrainingSession[] = [];
    rSnap.docs.forEach(function(d) {
      const data = d.data();
      const completedAt = data.completedAt?.toDate?.();
      if (!completedAt) return;
      const date = completedAt.toISOString().split('T')[0];
      const alreadyPlanned = planned.some(function(p) { return p.date === date && p.type === 'run'; });
      if (!alreadyPlanned) {
        const dist = ((data.distance || 0) / 1000).toFixed(1);
        const actType = data.activityType || 'run';
        autoRuns.push({
          id: 'auto-run-' + d.id,
          date: date,
          dayOfWeek: completedAt.getDay(),
          type: 'run',
          status: 'completed',
          runTemplateName: actType.charAt(0).toUpperCase() + actType.slice(1) + ' ' + dist + 'km',
        });
      }
    });

    // 4. Mark planned sessions as completed if a matching workout/run exists
    const merged = planned.map(function(session) {
      if (session.status === 'completed' || session.status === 'skipped') return session;
      if (session.type === 'lift') {
        const hasWorkout = wSnap.docs.some(function(d) { return (d.data().date as string) === session.date; });
        if (hasWorkout) return { ...session, status: 'completed' as const };
      }
      if (session.type === 'run') {
        const hasRun = autoRuns.some(function(r) { return r.date === session.date; }) ||
          rSnap.docs.some(function(d) {
            const ca = d.data().completedAt?.toDate?.();
            return ca && ca.toISOString().split('T')[0] === session.date;
          });
        if (hasRun) return { ...session, status: 'completed' as const };
      }
      return session;
    });

    // 5. Auto-populate scheduled sessions from weekSchedule (or generated fallback)
    const weekSched = (profile?.weekSchedule && profile.weekSchedule.length === 7)
      ? profile.weekSchedule
      : generateSchedule(profile?.weeklyWorkoutsTarget ?? 4, profile?.weeklyRunsTarget ?? 2);
    const scheduledFromProfile: TrainingSession[] = [];
    if (weekSched) {
      for (let di = 0; di < 7; di++) {
        const dd = new Date(currentWeekStart);
        dd.setDate(dd.getDate() + di);
        const dateStr = dd.toISOString().split('T')[0];
        const dow = dd.getDay();
        const sched = weekSched.find(function(s) { return s.day === dow; });
        if (sched && sched.type !== 'rest') {
          const types: ('lift' | 'run')[] = sched.type === 'both' ? ['lift', 'run'] : [sched.type as 'lift' | 'run'];
          types.forEach(function(t) {
            const alreadyCovered = merged.some(function(p) { return p.date === dateStr && p.type === t; }) ||
              autoWorkouts.some(function(a) { return a.date === dateStr && a.type === t; }) ||
              autoRuns.some(function(a) { return a.date === dateStr && a.type === t; });
            if (!alreadyCovered) {
              scheduledFromProfile.push({
                id: 'sched-' + t + '-' + dateStr,
                date: dateStr,
                dayOfWeek: dow,
                type: t,
                status: 'scheduled',
                ...(t === 'lift' && { liftProgramDay: 'Scheduled' }),
                ...(t === 'run' && { runTemplateName: 'Scheduled Run' }),
              });
            }
          });
        }
      }
    }

    // 6. Combine: planned (with auto-completion) + auto-detected + schedule-generated
    setSessions([...merged, ...autoWorkouts, ...autoRuns, ...scheduledFromProfile]);
  }, [user, weekStartStr, weekEndStr, currentWeekStart, profile?.weekSchedule, profile?.weeklyWorkoutsTarget, profile?.weeklyRunsTarget]);

  useEffect(function() {
    loadSessions();
  }, [loadSessions, currentWeekStart]);

  const weekDays = Array.from({ length: 7 }, function(_, i) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: d.toDateString() === new Date().toDateString(),
    };
  });

  const addSession = async function(date: string, type: 'run' | 'lift', template?: RunTemplate, liftDay?: string) {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
    await addDoc(ref, {
      date: date,
      dayOfWeek: new Date(date).getDay(),
      type: type,
      status: 'scheduled',
      ...(template && { runTemplateId: template.id, runTemplateName: template.name }),
      ...(liftDay && { liftProgramDay: liftDay }),
    });
    setShowAddModal(false);
    await loadSessions();
  };

  const updateSession = async function(sessionId: string, updates: Partial<TrainingSession>) {
    if (!user) return;
    // Don't try to update auto-generated or schedule-generated sessions in Firestore
    if (sessionId.startsWith('auto-') || sessionId.startsWith('sched-')) return;
    const ref = doc(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions', sessionId);
    await updateDoc(ref, updates);
    await loadSessions();
  };

  const prevWeek = function() {
    setCurrentWeekStart(function(d) { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  };
  const nextWeek = function() {
    setCurrentWeekStart(function(d) { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  };

  return (
    <div className="pb-24 px-4 pt-2 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="p-2 rounded-lg bg-muted text-sm pressable">{"\u2190"}</button>
        <h2 className="text-sm font-bold tracking-tight">
          {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {"\u2013"}{' '}
          {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </h2>
        <button onClick={nextWeek} className="p-2 rounded-lg bg-muted text-sm pressable">{"\u2192"}</button>
      </div>

      <WeekView
        weekDays={weekDays}
        sessions={sessions}
        weekSchedule={(profile?.weekSchedule && profile.weekSchedule.length === 7) ? profile.weekSchedule : generateSchedule(profile?.weeklyWorkoutsTarget ?? 4, profile?.weeklyRunsTarget ?? 2)}
        onAdd={function(date) {
          setSelectedDay(date);
          setShowAddModal(true);
        }}
        onStart={function(session) {
          if (session.type === 'run') navigate('/log?tab=run');
          else navigate('/log');
        }}
        onSkip={function(id) { updateSession(id, { status: 'skipped' }); }}
      />

      {showAddModal && selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto" style={{ background: "rgba(15, 15, 20, 0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Add Session</h3>
              <button onClick={function() { setShowAddModal(false); }} className="text-muted-foreground">{"\u2715"}</button>
            </div>

            <h4 className="text-sm font-semibold mb-2">{"\uD83C\uDFC3"} Run Workouts</h4>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {RUN_TEMPLATES.map(function(t) {
                return (
                  <button
                    key={t.id}
                    onClick={function() { addSession(selectedDay!, 'run', t); }}
                    className="p-3 rounded-xl border border-border bg-card text-left pressable"
                  >
                    <span className="text-lg">{t.icon}</span>
                    <p className="text-xs font-semibold mt-1">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.estimatedDuration} min</p>
                  </button>
                );
              })}
            </div>

            <h4 className="text-sm font-semibold mb-2">{"\uD83C\uDFCB\uFE0F"} Lift Sessions</h4>
            <div className="grid grid-cols-2 gap-2">
              {(programState?.workouts ?? []).map(function(day) {
                return (
                  <button
                    key={day.dayName}
                    onClick={function() { addSession(selectedDay!, 'lift', undefined, day.dayName); }}
                    className="p-3 rounded-xl border border-border bg-card text-left pressable"
                  >
                    <span className="text-lg">{"\uD83C\uDFCB\uFE0F"}</span>
                    <p className="text-xs font-semibold mt-1">{day.dayName}</p>
                    <p className="text-[10px] text-muted-foreground">{day.exercises.length} exercises</p>
                  </button>
                );
              })}
              {(!programState?.workouts || programState.workouts.length === 0) && (
                <p className="text-xs text-muted-foreground col-span-2">No programme set up yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
