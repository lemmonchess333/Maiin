import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Footprints, PersonStanding, Zap, RefreshCw, Route, Flag, Dumbbell, Headphones } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWeather, getWeatherIcon, getRunningTip, type WeatherData } from '@/lib/weather';
import ShoeSelector from './ShoeSelector';
import GuidedRunPicker from './GuidedRunPicker';
import type { GuidedRunWorkout } from '@/lib/guidedRun';


const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { Footprints, PersonStanding, Zap, RefreshCw, Route, Flag, Dumbbell, Headphones };
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
  activityType: 'easy',
  autoPause: true,
  audioCues: true,
  audioCueFrequency: 'every_km',
  paceAlerts: true,
  voiceRate: 0.9,
  displayStats: ['pace', 'distance', 'time', 'calories'],
  target: { type: 'none' },
};

const ACTIVITY_TYPES: { type: ActivityType; label: string; icon: string; description: string }[] = [
  { type: 'freerun', label: 'Free', icon: 'Footprints', description: 'Run at your own pace' },
  { type: 'easy',    label: 'Easy', icon: 'PersonStanding', description: 'Recovery pace' },
  { type: 'tempo',   label: 'Tempo', icon: 'Zap', description: 'Comfortably hard' },
  { type: 'intervals', label: 'Intervals', icon: 'RefreshCw', description: 'Repeats + rest' },
  { type: 'long',    label: 'Long', icon: 'Route', description: 'Distance-focused' },
  { type: 'race',    label: 'Race', icon: 'Flag', description: 'All-out effort' },
  { type: 'treadmill', label: 'Treadmill', icon: 'Dumbbell', description: 'Indoor, no GPS' },
  { type: 'guided', label: 'Guided', icon: 'Headphones', description: 'Coach-led workout' },
];


interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
}

export default function RunSetupModal({ onStart, onCancel, savedPreferences }: RunSetupModalProps) {
  const [config, setConfig] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...savedPreferences });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [selectedGuided, setSelectedGuided] = useState<GuidedRunWorkout | null>(null);
  const updateConfig = (partial: Partial<RunConfig>) => setConfig((prev) => ({ ...prev, ...partial }));
  const intervalConfig = config.intervals ?? { reps: 5, workDistance: 1000, restDuration: 90 };

  // Fetch weather on mount
  useEffect(() => {
    getCurrentWeather().then((w) => {
      setWeather(w);
      setWeatherLoading(false);
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-36 space-y-5 min-h-0" style={{ overscrollBehavior: "none" }}>
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
                      <label htmlFor={`interval-${f.field}`} className="text-[11px] text-muted-foreground">{f.label}</label>
                      <input id={`interval-${f.field}`} type="number" min={f.min} max={f.max} step={f.step} value={f.value}
                        onChange={(e) => updateConfig({ intervals: { ...intervalConfig, [f.field]: Number(e.target.value) } })}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
                    </div>
                  ))}
                  <div>
                    <label htmlFor="interval-target-pace" className="text-[11px] text-muted-foreground">Target pace (/km)</label>
                    <input id="interval-target-pace" type="text" placeholder="4:30"
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
                    ? { background: 'rgba(123,114,233,0.12)', color: '#7B72E9', border: '1px solid rgba(123,114,233,0.3)' }
                    : { background: 'rgba(0,0,0,0.04)', color: 'var(--color-muted-foreground)', border: '1px solid rgba(0,0,0,0.08)' }
                  }>
                  {t === 'none' ? 'None' : t === 'distance' ? 'Distance' : t === 'time' ? 'Time' : 'Pace'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Target value inputs */}
        {config.target.type !== 'none' && config.activityType !== 'intervals' && config.activityType !== 'treadmill' && (
          <div className="p-4 rounded-xl border border-border space-y-2 bg-card">
            {config.target.type === 'distance' && (
              <div>
                <label htmlFor="target-distance" className="text-[11px] text-muted-foreground">Distance (km)</label>
                <input id="target-distance" type="number" step="0.5" min="0.5" max="100"
                  value={config.target.value ? config.target.value / 1000 : 5}
                  onChange={(e) => updateConfig({ target: { type: 'distance', value: Number(e.target.value) * 1000 } })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
              </div>
            )}
            {config.target.type === 'time' && (
              <div>
                <label htmlFor="target-time" className="text-[11px] text-muted-foreground">Duration (minutes)</label>
                <input id="target-time" type="number" step="5" min="5" max="300"
                  value={config.target.value ? Math.round(config.target.value / 60) : 30}
                  onChange={(e) => updateConfig({ target: { type: 'time', value: Number(e.target.value) * 60 } })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
              </div>
            )}
            {config.target.type === 'pace' && (
              <div>
                <label htmlFor="target-pace" className="text-[11px] text-muted-foreground">Target pace (/km)</label>
                <input id="target-pace" type="text" placeholder="5:30"
                  defaultValue={config.target.value ? `${Math.floor(config.target.value / 60)}:${String(config.target.value % 60).padStart(2, '0')}` : '5:30'}
                  onChange={(e) => {
                    const [m, s] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(m) && Number.isFinite(s)) {
                      updateConfig({ target: { type: 'pace', value: m * 60 + s } });
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
              </div>
            )}
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
                    role="switch"
                    aria-checked={config[setting.key]}
                    aria-label={setting.label}
                    className="w-11 h-6 rounded-full transition-colors relative"
                    style={{ background: config[setting.key] ? '#7B72E9' : 'rgba(0,0,0,0.1)' }}
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
                      role="switch"
                      aria-checked={config.paceAlerts}
                      aria-label="Pace alerts"
                      className="w-11 h-6 rounded-full transition-colors relative"
                      style={{ background: config.paceAlerts ? '#7B72E9' : 'rgba(0,0,0,0.1)' }}
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
          style={{ background: 'linear-gradient(135deg, #e87316, #d84588)' }}
        >
          {config.activityType === 'treadmill' ? <><Dumbbell className="inline w-5 h-5 mr-1" /> Start Treadmill</> : <><Footprints className="inline w-5 h-5 mr-1" /> Start Run</>}
        </button>
        <button onClick={() => setShowTypeSheet(v => !v)} className="text-sm text-muted-foreground underline mt-2 block mx-auto hover:text-foreground transition-colors">
          Change type ({ACTIVITY_TYPES.find(a => a.type === config.activityType)?.label || 'Easy'})
        </button>

        {showTypeSheet && (
          <div className="mt-2 p-3 rounded-xl border border-border bg-card space-y-1">
            {ACTIVITY_TYPES.map((at) => {
              const IC = ICON_MAP[at.icon];
              const isActive = config.activityType === at.type;
              return (
                <button key={at.type}
                  onClick={() => { updateConfig({ activityType: at.type }); setShowTypeSheet(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors active:scale-[0.98]"
                  style={isActive ? { background: 'rgba(139,92,246,0.12)' } : {}}>
                  {IC && <IC size={18} className={isActive ? 'text-purple-500' : 'text-muted-foreground'} />}
                  <div>
                    <p className="text-sm font-medium" style={{ color: isActive ? '#7B72E9' : 'var(--color-foreground)' }}>{at.label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>{at.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
