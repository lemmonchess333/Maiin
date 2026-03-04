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
  var { user, profile } = useAuth();
  var { programState } = useProgram();
  var navigate = useNavigate();
  var [sessions, setSessions] = useState<TrainingSession[]>([]);
  var [currentWeekStart, setCurrentWeekStart] = useState(function() {
    var d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  var [showAddModal, setShowAddModal] = useState(false);
  var [selectedDay, setSelectedDay] = useState<string | null>(null);

  var weekEnd = new Date(currentWeekStart.getTime() + 6 * 86400000);
  var weekStartStr = currentWeekStart.toISOString().split('T')[0];
  var weekEndStr = weekEnd.toISOString().split('T')[0];

  var loadSessions = useCallback(async function() {
    if (!user) return;

    // 1. Load manually planned sessions
    var ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
    var snap = await getDocs(query(ref, orderBy('date')));
    var planned = snap.docs.map(function(d) { return { id: d.id, ...d.data() } as TrainingSession; });

    // 2. Load completed workouts in this week range
    var workoutsRef = collection(db, 'users', user.uid, 'workouts');
    var wSnap = await getDocs(query(workoutsRef, where('date', '>=', weekStartStr), where('date', '<=', weekEndStr)));
    var autoWorkouts: TrainingSession[] = [];
    wSnap.docs.forEach(function(d) {
      var data = d.data();
      var date = data.date as string;
      // Skip if there is already a planned session for this date and type
      var alreadyPlanned = planned.some(function(p) { return p.date === date && p.type === 'lift'; });
      if (!alreadyPlanned) {
        // Get first exercise name as label
        var exercises = data.exercises || [];
        var label = exercises.length > 0 ? exercises[0].exerciseName || 'Workout' : 'Workout';
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
    var runsRef = collection(db, 'users', user.uid, 'runs');
    var startTs = Timestamp.fromDate(currentWeekStart);
    var endTs = Timestamp.fromDate(new Date(weekEnd.getTime() + 86400000));
    var rSnap = await getDocs(query(runsRef, where('completedAt', '>=', startTs), where('completedAt', '<=', endTs), orderBy('completedAt')));
    var autoRuns: TrainingSession[] = [];
    rSnap.docs.forEach(function(d) {
      var data = d.data();
      var completedAt = data.completedAt?.toDate?.();
      if (!completedAt) return;
      var date = completedAt.toISOString().split('T')[0];
      var alreadyPlanned = planned.some(function(p) { return p.date === date && p.type === 'run'; });
      if (!alreadyPlanned) {
        var dist = ((data.distance || 0) / 1000).toFixed(1);
        var actType = data.activityType || 'run';
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
    var merged = planned.map(function(session) {
      if (session.status === 'completed' || session.status === 'skipped') return session;
      if (session.type === 'lift') {
        var hasWorkout = wSnap.docs.some(function(d) { return (d.data().date as string) === session.date; });
        if (hasWorkout) return { ...session, status: 'completed' as const };
      }
      if (session.type === 'run') {
        var hasRun = autoRuns.some(function(r) { return r.date === session.date; }) ||
          rSnap.docs.some(function(d) {
            var ca = d.data().completedAt?.toDate?.();
            return ca && ca.toISOString().split('T')[0] === session.date;
          });
        if (hasRun) return { ...session, status: 'completed' as const };
      }
      return session;
    });

    // 5. Auto-populate scheduled sessions from weekSchedule (or generated fallback)
    var weekSched = (profile?.weekSchedule && profile.weekSchedule.length === 7)
      ? profile.weekSchedule
      : generateSchedule(profile?.weeklyWorkoutsTarget ?? 4, profile?.weeklyRunsTarget ?? 2);
    var scheduledFromProfile: TrainingSession[] = [];
    if (weekSched) {
      for (var di = 0; di < 7; di++) {
        var dd = new Date(currentWeekStart);
        dd.setDate(dd.getDate() + di);
        var dateStr = dd.toISOString().split('T')[0];
        var dow = dd.getDay();
        var sched = weekSched.find(function(s) { return s.day === dow; });
        if (sched && sched.type !== 'rest') {
          var alreadyCovered = merged.some(function(p) { return p.date === dateStr && p.type === sched!.type; }) ||
            autoWorkouts.some(function(a) { return a.date === dateStr && a.type === sched!.type; }) ||
            autoRuns.some(function(a) { return a.date === dateStr && a.type === sched!.type; });
          if (!alreadyCovered) {
            scheduledFromProfile.push({
              id: 'sched-' + sched.type + '-' + dateStr,
              date: dateStr,
              dayOfWeek: dow,
              type: sched.type as 'run' | 'lift',
              status: 'scheduled',
              ...(sched.type === 'lift' && { liftProgramDay: 'Scheduled' }),
              ...(sched.type === 'run' && { runTemplateName: 'Scheduled Run' }),
            });
          }
        }
      }
    }

    // 6. Combine: planned (with auto-completion) + auto-detected + schedule-generated
    setSessions([...merged, ...autoWorkouts, ...autoRuns, ...scheduledFromProfile]);
  }, [user, weekStartStr, weekEndStr, currentWeekStart, profile?.weekSchedule, profile?.weeklyWorkoutsTarget, profile?.weeklyRunsTarget]);

  useEffect(function() {
    loadSessions();
  }, [loadSessions, currentWeekStart]);

  var weekDays = Array.from({ length: 7 }, function(_, i) {
    var d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: d.toDateString() === new Date().toDateString(),
    };
  });

  var addSession = async function(date: string, type: 'run' | 'lift', template?: RunTemplate, liftDay?: string) {
    if (!user) return;
    var ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
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

  var updateSession = async function(sessionId: string, updates: Partial<TrainingSession>) {
    if (!user) return;
    // Don't try to update auto-generated or schedule-generated sessions in Firestore
    if (sessionId.startsWith('auto-') || sessionId.startsWith('sched-')) return;
    var ref = doc(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions', sessionId);
    await updateDoc(ref, updates);
    await loadSessions();
  };

  var prevWeek = function() {
    setCurrentWeekStart(function(d) { var n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  };
  var nextWeek = function() {
    setCurrentWeekStart(function(d) { var n = new Date(d); n.setDate(n.getDate() + 7); return n; });
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
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto">
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
