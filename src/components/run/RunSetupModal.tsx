import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWeather, getWeatherIcon, getRunningTip, type WeatherData } from '@/lib/weather';
import ShoeSelector from './ShoeSelector';
import GuidedRunPicker from './GuidedRunPicker';
import type { GuidedRunWorkout } from '@/lib/guidedRun';

export type ActivityType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'treadmill' | 'freerun' | 'guided';

export interface RunConfig {
  activityType: ActivityType;
  autoPause: boolean;
  audioCues: boolean;
  audioCueFrequency: 'every_km' | 'every_500m' | 'every_5min' | 'off';
  paceAlerts: boolean;
  voiceRate: number;
  displayStats: ('pace' | 'distance' | 'time' | 'calories' | 'elevation' | 'avgPace')[];
  target: {
    type: 'none' | 'distance' | 'time' | 'pace';
    value?: number;
  };
  intervals?: {
    reps: number;
    workDistance?: number;
    workDuration?: number;
    workPace?: number;
    restDuration: number;
    warmupDuration?: number;
    cooldownDuration?: number;
  };
  guidedWorkout?: GuidedRunWorkout;
  shoeId?: string;
}

const DEFAULT_CONFIG: RunConfig = {
  activityType: 'freerun',
  autoPause: true,
  audioCues: true,
  audioCueFrequency: 'every_km',
  paceAlerts: true,
  voiceRate: 0.9,
  displayStats: ['pace', 'distance', 'time', 'calories'],
  target: { type: 'none' },
};

const ACTIVITY_TYPES: { type: ActivityType; label: string; icon: string; description: string }[] = [
  { type: 'freerun', label: 'Free', icon: '🏃', description: 'Run at your own pace' },
  { type: 'easy',    label: 'Easy', icon: '🚶', description: 'Recovery pace' },
  { type: 'tempo',   label: 'Tempo', icon: '⚡', description: 'Comfortably hard' },
  { type: 'intervals', label: 'Intervals', icon: '🔄', description: 'Repeats + rest' },
  { type: 'long',    label: 'Long', icon: '🛤️', description: 'Distance-focused' },
  { type: 'race',    label: 'Race', icon: '🏁', description: 'All-out effort' },
  { type: 'treadmill', label: 'Treadmill', icon: '🏋️', description: 'Indoor, no GPS' },
  { type: 'guided', label: 'Guided', icon: '🎧', description: 'Coach-led workout' },
];

// Descriptions for the selected activity shown below the strip
const ACTIVITY_DESCRIPTIONS: Record<ActivityType, { label: string; cues: string[] }> = {
  freerun:   { label: 'Free Run', cues: ['No targets', 'GPS tracking', 'Audio cues per km'] },
  easy:      { label: 'Easy Run', cues: ['Conversational pace', 'Zone 2 effort', 'Recovery-focused'] },
  tempo:     { label: 'Tempo Run', cues: ['Comfortably hard', '20–40 min effort', 'Pace-goal optional'] },
  intervals: { label: 'Intervals', cues: ['High-intensity repeats', 'Built-in rest timer', 'Configurable reps'] },
  long:      { label: 'Long Run', cues: ['Easy to moderate pace', 'Distance goal optional', 'Aerobic base building'] },
  race:      { label: 'Race', cues: ['All-out effort', 'Distance goal required', 'PR attempt mode'] },
  treadmill: { label: 'Treadmill', cues: ['Manual distance input', 'No GPS', 'Indoor tracking'] },
  guided: { label: 'Guided Run', cues: ['Coach-led segments', 'TTS cues', 'Structured workout'] },
};

interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
}

export default function RunSetupModal({ onStart, onCancel, savedPreferences }: RunSetupModalProps) {
  const [config, setConfig] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...savedPreferences });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [selectedGuided, setSelectedGuided] = useState<GuidedRunWorkout | null>(null);
  const updateConfig = (partial: Partial<RunConfig>) => setConfig((prev) => ({ ...prev, ...partial }));
  const intervalConfig = config.intervals ?? { reps: 5, workDistance: 1000, restDuration: 90 };
  const selectedInfo = ACTIVITY_DESCRIPTIONS[config.activityType];

  // Fetch weather on mount
  useEffect(() => {
    getCurrentWeather().then((w) => {
      setWeather(w);
      setWeatherLoading(false);
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-36 space-y-5">
        {/* Back */}
        <button onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted-foreground self-start active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Ready to run?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Pick a type or just go</p>
        </div>

        {/* Weather strip */}
        {!weatherLoading && weather && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-2xl">{getWeatherIcon(weather.weatherCode)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {weather.temperature}°C
                {weather.feelsLike !== weather.temperature && <span className="text-xs text-muted-foreground ml-1">(feels {weather.feelsLike}°)</span>}
              </p>
              <motion.p
                key={config.activityType}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="text-[11px] text-muted-foreground"
              >
                {getRunningTip(weather, config.activityType)}
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* Shoe selector */}
        <ShoeSelector
          selectedShoeId={config.shoeId ?? null}
          onSelect={(id) => updateConfig({ shoeId: id })}
        />

        {/* Activity type strip — horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {ACTIVITY_TYPES.map((at) => {
            const isActive = config.activityType === at.type;
            return (
              <button
                key={at.type}
                onClick={() => updateConfig({ activityType: at.type })}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl border-2 transition-all active:scale-95"
                style={isActive ? {
                  borderColor: 'rgba(139,92,246,0.7)',
                  background: 'rgba(139,92,246,0.12)',
                  boxShadow: '0 0 0 3px rgba(139,92,246,0.2)',
                } : {
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <span className="text-2xl leading-none">{at.icon}</span>
                <span className="text-[11px] font-semibold whitespace-nowrap"
                  style={{ color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
                  {at.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected activity description */}
        <motion.div
          key={config.activityType}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl space-y-1.5"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <p className="text-sm font-semibold text-white">{selectedInfo.label}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {selectedInfo.cues.map((c) => (
              <p key={c} className="text-[11px] text-gray-600 dark:text-gray-300">· {c}</p>
            ))}
          </div>
        </motion.div>

        {/* Interval config — only shown for intervals */}
        <AnimatePresence>
          {config.activityType === 'intervals' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-xl border border-border space-y-3 bg-card">
                <h3 className="text-sm font-semibold">Interval Setup</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Repeats', field: 'reps' as const, value: intervalConfig.reps, min: 1, max: 20, step: 1 },
                    { label: 'Work (m)', field: 'workDistance' as const, value: intervalConfig.workDistance ?? 1000, min: 100, max: 5000, step: 100 },
                    { label: 'Rest (s)', field: 'restDuration' as const, value: intervalConfig.restDuration, min: 10, max: 300, step: 10 },
                  ].map((f) => (
                    <div key={f.field}>
                      <label className="text-[10px] text-muted-foreground">{f.label}</label>
                      <input type="number" min={f.min} max={f.max} step={f.step} value={f.value}
                        onChange={(e) => updateConfig({ intervals: { ...intervalConfig, [f.field]: Number(e.target.value) } })}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
                    </div>
                  ))}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Target pace (/km)</label>
                    <input type="text" placeholder="4:30"
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                      onChange={(e) => {
                        const [m, s] = e.target.value.split(':').map(Number);
                        if (Number.isFinite(m) && Number.isFinite(s)) {
                          updateConfig({ intervals: { ...intervalConfig, workPace: m * 60 + s } });
                        }
                      }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guided run picker — shown for guided type */}
        <AnimatePresence>
          {config.activityType === 'guided' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <GuidedRunPicker
                selected={selectedGuided}
                onSelect={(w) => {
                  setSelectedGuided(w);
                  updateConfig({ guidedWorkout: w });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Target — for non-interval, non-treadmill */}
        {config.activityType !== 'intervals' && config.activityType !== 'treadmill' && (
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-widest">Target (optional)</p>
            <div className="flex gap-2">
              {(['none', 'distance', 'time', 'pace'] as const).map((t) => (
                <button key={t}
                  onClick={() => updateConfig({ target: { type: t, value: t === 'distance' ? 5 : t === 'time' ? 1800 : t === 'pace' ? 330 : undefined } })}
                  className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                  style={config.target.type === t
                    ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.4)' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
                  }>
                  {t === 'none' ? 'None' : t === 'distance' ? 'Distance' : t === 'time' ? 'Time' : 'Pace'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advanced settings — collapsed by default */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center justify-between w-full py-2.5 text-sm text-muted-foreground"
        >
          <span>Advanced settings</span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              {[
                { label: 'Auto-pause', key: 'autoPause' as const },
                { label: 'Audio cues', key: 'audioCues' as const },
              ].map((setting) => (
                <div key={setting.key}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
                  <span className="text-sm">{setting.label}</span>
                  <button
                    onClick={() => updateConfig({ [setting.key]: !config[setting.key] })}
                    className="w-11 h-6 rounded-full transition-colors relative"
                    style={{ background: config[setting.key] ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      style={{ transform: config[setting.key] ? 'translateX(20px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              ))}
              {config.audioCues && (
                <>
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
                    <span className="text-sm">Pace alerts</span>
                    <button
                      onClick={() => updateConfig({ paceAlerts: !config.paceAlerts })}
                      className="w-11 h-6 rounded-full transition-colors relative"
                      style={{ background: config.paceAlerts ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }}
                    >
                      <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: config.paceAlerts ? 'translateX(20px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                  <div className="p-3.5 rounded-xl border border-border/50 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Voice speed</span>
                      <span className="text-xs text-muted-foreground">{config.voiceRate.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range"
                      min="0.6"
                      max="1.4"
                      step="0.1"
                      value={config.voiceRate}
                      onChange={(e) => updateConfig({ voiceRate: Number(e.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 px-5 pt-3 pb-5 safe-area-pb"
        style={{ background: 'linear-gradient(to top, var(--color-background) 80%, transparent)' }}>
        <button
          onClick={() => onStart(config)}
          className="btn-start-run-pulse w-full py-5 rounded-2xl text-white font-bold text-lg shadow-[var(--ds-shadow-orange-glow)] active:scale-[0.97] transition-transform"
          style={{ background: 'linear-gradient(135deg, #f97316, #ec4899)' }}
        >
          {config.activityType === 'treadmill' ? '🏋️  Start Treadmill' : '🏃  Start Run'}
        </button>
      </div>
    </div>
  );
}
