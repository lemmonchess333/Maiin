import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { RUN_TEMPLATES, type RunTemplate } from '../lib/workoutTemplates';
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
  var { user } = useAuth();
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

    // 5. Combine: planned (with auto-completion) + auto-detected that weren't already planned
    setSessions([...merged, ...autoWorkouts, ...autoRuns]);
  }, [user, weekStartStr, weekEndStr, currentWeekStart]);

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
    // Don't try to update auto-generated sessions in Firestore
    if (sessionId.startsWith('auto-')) return;
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
              {['Upper A', 'Lower A', 'Upper B', 'Lower B'].map(function(day) {
                return (
                  <button
                    key={day}
                    onClick={function() { addSession(selectedDay!, 'lift', undefined, day); }}
                    className="p-3 rounded-xl border border-border bg-card text-left pressable"
                  >
                    <span className="text-lg">{"\uD83C\uDFCB\uFE0F"}</span>
                    <p className="text-xs font-semibold mt-1">{day}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
