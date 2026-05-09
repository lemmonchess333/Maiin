import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, ChevronRight, Check, Footprints, PersonStanding, Zap, RefreshCw, Route, Flag, Dumbbell, Headphones } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from 'vaul';
import { getCurrentWeather, getWeatherIcon, getRunningTip, type WeatherData } from '@/lib/weather';
import ShoeSelector from './ShoeSelector';
import GuidedRunPicker from './GuidedRunPicker';
import type { GuidedRunWorkout } from '@/lib/guidedRun';
import type { ActivityType } from '@/types/run';
import { requiresManualDistance } from '@/lib/runGuards';
import { getTargetValidationError } from '@/lib/runTargetValidation';

/* `ActivityType` now lives in `@/types/run` so non-component modules
   (e.g. `runGuards.ts`) can import it without pulling this component
   into their dep graph. The re-export below preserves backward
   compatibility for any code that imports `ActivityType` from here. */
export type { ActivityType };


const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { Footprints, PersonStanding, Zap, RefreshCw, Route, Flag, Dumbbell, Headphones };

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

/* Run-type registry. `name` is the long-form label used by the
   selected-run card, the chooser, and the Start CTA ("Start Free
   Run"). Two chip fields:
     `cardChip`    — long form for the selected-run card at the top
                     of the setup ("Outdoor GPS", "Manual distance",
                     "Audio"). The card has horizontal room for the
                     fuller phrasing.
     `chooserChip` — short form for the chooser rows ("GPS",
                     "Manual", "Audio"). The chooser packs more
                     info per row, so the chip stays terse.
   Both disclose the measurement source so users understand why
   pace metrics work for outdoor types but not for treadmill.
   `cardDescription` and `chooserDescription` allow the chooser to
   carry slightly more detail per row (e.g. "Indoor, manual
   distance" in the chooser vs "Indoor" on the card where the chip
   already says "Manual distance").
   `group` drives the chooser's Outdoor / Other section split.
   `'manual'` is deliberately absent — that activityType is set
   programmatically by the GPS-fallback "Track without GPS" path,
   never picked directly by the user. */
type ActivityTypeOption = {
  type: ActivityType;
  label: string;
  name: string;
  icon: string;
  cardDescription: string;
  cardChip: string;
  chooserDescription: string;
  chooserChip: string;
  group: 'outdoor' | 'other';
};

const ACTIVITY_TYPES: ActivityTypeOption[] = [
  { type: 'freerun',   label: 'Free',      name: 'Free Run',     icon: 'Footprints',     cardDescription: 'Run at your own pace', cardChip: 'Outdoor GPS',     chooserDescription: 'Run at your own pace', chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'easy',      label: 'Easy',      name: 'Easy Run',     icon: 'PersonStanding', cardDescription: 'Recovery pace',         cardChip: 'Outdoor GPS',     chooserDescription: 'Recovery pace',         chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'tempo',     label: 'Tempo',     name: 'Tempo Run',    icon: 'Zap',            cardDescription: 'Sustained effort',      cardChip: 'Outdoor GPS',     chooserDescription: 'Sustained effort',      chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'intervals', label: 'Intervals', name: 'Intervals',    icon: 'RefreshCw',      cardDescription: 'Repeats + rest',        cardChip: 'Outdoor GPS',     chooserDescription: 'Repeats + rest',        chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'long',      label: 'Long',      name: 'Long Run',     icon: 'Route',          cardDescription: 'Distance-focused',      cardChip: 'Outdoor GPS',     chooserDescription: 'Distance-focused',      chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'race',      label: 'Race',      name: 'Race',         icon: 'Flag',           cardDescription: 'All-out effort',        cardChip: 'Outdoor GPS',     chooserDescription: 'All-out effort',        chooserChip: 'GPS',    group: 'outdoor' },
  { type: 'treadmill', label: 'Treadmill', name: 'Treadmill',    icon: 'Dumbbell',       cardDescription: 'Indoor',                cardChip: 'Manual distance', chooserDescription: 'Indoor, manual distance', chooserChip: 'Manual', group: 'other' },
  { type: 'guided',    label: 'Guided',    name: 'Guided Run',   icon: 'Headphones',     cardDescription: 'Coach-led workout',     cardChip: 'Audio',           chooserDescription: 'Coach-led workout',     chooserChip: 'Audio',  group: 'other' },
];


interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
}

export default function RunSetupModal({ onStart, onCancel, savedPreferences }: RunSetupModalProps) {
  const [config, setConfig] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...savedPreferences });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [selectedGuided, setSelectedGuided] = useState<GuidedRunWorkout | null>(null);
  const updateConfig = (partial: Partial<RunConfig>) => setConfig((prev) => ({ ...prev, ...partial }));
  const intervalConfig = config.intervals ?? { reps: 5, workDistance: 1000, restDuration: 90 };

  /* Pre-flight target validation. Catches the case where the user
     types a sub-threshold distance / duration / pace and taps Start
     before the input loses focus (which would have triggered the
     existing onBlur clamp). Disables the Start CTA + surfaces an
     inline error so the user understands why. */
  const targetError = getTargetValidationError(config);

  // Fetch weather on mount
  useEffect(() => {
    getCurrentWeather().then((w) => {
      setWeather(w);
      setWeatherLoading(false);
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Back lives in a non-scrolling header row so it stays visible
          regardless of how far the content scrolls. Previously sat
          inside the scroll container and disappeared when users
          scrolled past it (seen on the empty/short-content layout
          where the sticky CTA pulls upward). */}
      <header className="px-5 pt-4 pb-2">
        <button onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted-foreground active:scale-95">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-36 space-y-5 min-h-0" style={{ overscrollBehavior: "none" }}>
        {/* Header */}
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Ready to run?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Pick a type or just go</p>
        </div>

        {/* Selected-run card. Replaces the underlined "Change type"
            link with a tappable native-feeling control showing the
            chosen run type, its description, and the measurement
            source chip. Tapping opens the chooser drawer below. */}
        {(() => {
          const selected = ACTIVITY_TYPES.find(a => a.type === config.activityType) ?? ACTIVITY_TYPES[1]; // Easy fallback
          const SelectedIcon = ICON_MAP[selected.icon];
          return (
            <button
              type="button"
              onClick={() => setShowChooser(true)}
              className="w-full p-4 rounded-2xl bg-card border border-border flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
              aria-label={`Selected run type: ${selected.name}. Tap to change.`}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(123,114,233,0.10)' }}>
                {SelectedIcon && <SelectedIcon className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground">{selected.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">{selected.cardDescription}</span>
                  <span className="text-xs text-muted-foreground/60">·</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{selected.cardChip}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          );
        })()}

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
                className="text-xs text-muted-foreground"
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
                      <label htmlFor={`interval-${f.field}`} className="text-xs text-muted-foreground">{f.label}</label>
                      <input id={`interval-${f.field}`} type="number" min={f.min} max={f.max} step={f.step} value={f.value}
                        onChange={(e) => updateConfig({ intervals: { ...intervalConfig, [f.field]: Number(e.target.value) } })}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
                    </div>
                  ))}
                  <div>
                    <label htmlFor="interval-target-pace" className="text-xs text-muted-foreground">Target pace (/km)</label>
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
                <label htmlFor="target-distance" className="text-xs text-muted-foreground">Distance (km)</label>
                <input id="target-distance" type="number" step="0.5" min="0.5" max="100"
                  value={config.target.value ? config.target.value / 1000 : 5}
                  onChange={(e) => updateConfig({ target: { type: 'distance', value: Number(e.target.value) * 1000 } })}
                  /* HTML `min` / `max` are validation hints — typing
                     freely bypasses them. QA caught a 0.005km target
                     persisting because the onChange writes whatever
                     the user typed. Snap to the valid range when the
                     input loses focus so users keep mid-edit freedom
                     but can't ship an out-of-range target. */
                  onBlur={(e) => {
                    const km = Number(e.target.value);
                    const clamped = Number.isFinite(km) ? Math.max(0.5, Math.min(100, km)) : 5;
                    if (clamped !== km) {
                      updateConfig({ target: { type: 'distance', value: clamped * 1000 } });
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
              </div>
            )}
            {config.target.type === 'time' && (
              <div>
                <label htmlFor="target-time" className="text-xs text-muted-foreground">Duration (minutes)</label>
                {/* HTML min lowered from 5 to 1 to match the
                    runTargetValidation floor; onBlur clamp dropped
                    its 5-min floor too. Brief warmups + flexible
                    cooldowns are valid targets — under 1 minute is
                    where it stops being a real run intention. */}
                <input id="target-time" type="number" step="5" min="1" max="300"
                  value={config.target.value ? Math.round(config.target.value / 60) : 30}
                  onChange={(e) => updateConfig({ target: { type: 'time', value: Number(e.target.value) * 60 } })}
                  onBlur={(e) => {
                    const mins = Number(e.target.value);
                    const clamped = Number.isFinite(mins) ? Math.max(1, Math.min(300, mins)) : 30;
                    if (clamped !== mins) {
                      updateConfig({ target: { type: 'time', value: clamped * 60 } });
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center" />
              </div>
            )}
            {config.target.type === 'pace' && (
              <div>
                <label htmlFor="target-pace" className="text-xs text-muted-foreground">Target pace (/km)</label>
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
            {/* Inline target validation. Surfaces the
                getTargetValidationError verdict so users see why
                the Start button is disabled before tapping it.
                Coral tint matches the running-flow accent without
                being alarm-red. */}
            {targetError && (
              <p className="text-xs mt-1" style={{ color: '#D4637A' }} role="alert">
                {targetError}
              </p>
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
                  {/* Pace alerts hidden for manual-distance modes
                      (treadmill today; manual once that activityType
                      ships). Pace alerts depend on GPS-derived current
                      pace via `audioCues.checkPaceAlert` in Run.tsx —
                      with no GPS the toggle was a visible no-op. Using
                      requiresManualDistance() (not an inline equality
                      check) so the gate auto-extends to 'manual' when
                      that lands. */}
                  {!requiresManualDistance(config.activityType) && (
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
                  )}
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

      {/* Sticky CTA. Underlined "Change type" link removed — the
          selected-run card at the top now owns that affordance.
          Start text is contextual per run type ("Start Free Run",
          "Start Treadmill", "Start Guided Run") so the button
          mirrors the user's selection. */}
      <div className="sticky bottom-0 px-5 pt-3 pb-5 safe-area-pb"
        style={{ background: 'linear-gradient(to top, var(--color-background) 80%, transparent)' }}>
        {(() => {
          const selected = ACTIVITY_TYPES.find(a => a.type === config.activityType) ?? ACTIVITY_TYPES[1];
          const Icon = config.activityType === 'treadmill' ? Dumbbell : Footprints;
          return (
            <button
              onClick={() => { if (!targetError) onStart(config); }}
              disabled={!!targetError}
              className="btn-start-run-pulse w-full py-5 rounded-2xl text-white font-semibold text-lg shadow-[var(--ds-shadow-orange-glow)] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #e87316, #d84588)' }}
            >
              <Icon className="inline w-5 h-5 mr-1" /> Start {selected.name}
            </button>
          );
        })()}
      </div>

      {/* Run-type chooser drawer. Replaces the in-CTA inline picker.
          Grouped Outdoor / Other rows; each shows icon + name +
          description + measurement chip + selected check.
          'manual' is deliberately excluded — that activityType is
          set programmatically by the GPS-fallback "Track without
          GPS" path, never picked by the user. */}
      <Drawer.Root open={showChooser} onOpenChange={setShowChooser}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border outline-none max-h-[85vh] flex flex-col">
            <div className="px-5 pt-3 pb-2 shrink-0">
              <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/20 mb-3" aria-hidden="true" />
              <Drawer.Title className="text-lg font-bold text-foreground">Choose run type</Drawer.Title>
              <Drawer.Description className="sr-only">Pick how you want to record this run.</Drawer.Description>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-4">
              {(['outdoor', 'other'] as const).map((group) => {
                const items = ACTIVITY_TYPES.filter(a => a.group === group);
                return (
                  <div key={group} className="space-y-1">
                    <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {group === 'outdoor' ? 'Outdoor' : 'Other'}
                    </p>
                    {items.map((at) => {
                      const IC = ICON_MAP[at.icon];
                      const isActive = config.activityType === at.type;
                      return (
                        <button
                          key={at.type}
                          onClick={() => { updateConfig({ activityType: at.type }); setShowChooser(false); }}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors active:scale-[0.98]"
                          style={isActive ? { background: 'rgba(123,114,233,0.10)' } : {}}
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: isActive ? 'rgba(123,114,233,0.18)' : 'var(--color-muted)' }}>
                            {IC && <IC className={`w-5 h-5 ${isActive ? 'text-purple-500' : 'text-muted-foreground'}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold" style={{ color: isActive ? '#7B72E9' : 'var(--color-foreground)' }}>
                                {at.name}
                              </p>
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                {at.chooserChip}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{at.chooserDescription}</p>
                          </div>
                          {isActive && (
                            <Check className="w-4 h-4 shrink-0" style={{ color: '#7B72E9' }} aria-label="Selected" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
