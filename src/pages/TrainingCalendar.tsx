import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc } from 'firebase/firestore';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
    const snap = await getDocs(query(ref, orderBy('date')));
    setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrainingSession)));
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, currentWeekStart]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: d.toDateString() === new Date().toDateString(),
    };
  });

  const addSession = async (date: string, type: 'run' | 'lift', template?: RunTemplate, liftDay?: string) => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions');
    await addDoc(ref, {
      date,
      dayOfWeek: new Date(date).getDay(),
      type,
      status: 'scheduled',
      ...(template && { runTemplateId: template.id, runTemplateName: template.name }),
      ...(liftDay && { liftProgramDay: liftDay }),
    });
    setShowAddModal(false);
    await loadSessions();
  };

  const updateSession = async (sessionId: string, updates: Partial<TrainingSession>) => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid, 'trainingPlan', 'current', 'sessions', sessionId);
    await updateDoc(ref, updates);
    await loadSessions();
  };

  const prevWeek = () => setCurrentWeekStart((d) => {
    const n = new Date(d);
    n.setDate(n.getDate() - 7);
    return n;
  });
  const nextWeek = () => setCurrentWeekStart((d) => {
    const n = new Date(d);
    n.setDate(n.getDate() + 7);
    return n;
  });

  return (
    <div className="pb-24 px-4 pt-2 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="p-2 rounded-lg bg-muted text-sm pressable">←</button>
        <h2 className="text-sm font-bold tracking-tight">
          {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
          {new Date(currentWeekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </h2>
        <button onClick={nextWeek} className="p-2 rounded-lg bg-muted text-sm pressable">→</button>
      </div>

      <WeekView
        weekDays={weekDays}
        sessions={sessions}
        onAdd={(date) => {
          setSelectedDay(date);
          setShowAddModal(true);
        }}
        onStart={(session) => {
          if (session.type === 'run') navigate('/log?tab=run');
          else navigate('/log');
        }}
        onSkip={(id) => updateSession(id, { status: 'skipped' })}
      />

      {showAddModal && selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Add Session</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground">✕</button>
            </div>

            <h4 className="text-sm font-semibold mb-2">🏃 Run Workouts</h4>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {RUN_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addSession(selectedDay, 'run', t)}
                  className="p-3 rounded-xl border border-border bg-card text-left pressable"
                >
                  <span className="text-lg">{t.icon}</span>
                  <p className="text-xs font-semibold mt-1">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t.estimatedDuration} min</p>
                </button>
              ))}
            </div>

            <h4 className="text-sm font-semibold mb-2">🏋️ Lift Sessions</h4>
            <div className="grid grid-cols-2 gap-2">
              {['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((day) => (
                <button
                  key={day}
                  onClick={() => addSession(selectedDay, 'lift', undefined, day)}
                  className="p-3 rounded-xl border border-border bg-card text-left pressable"
                >
                  <span className="text-lg">🏋️</span>
                  <p className="text-xs font-semibold mt-1">{day}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
