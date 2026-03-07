import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export type ActivityType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'treadmill' | 'freerun';

export interface RunConfig {
  activityType: ActivityType;
  autoPause: boolean;
  audioCues: boolean;
  audioCueFrequency: 'every_km' | 'every_500m' | 'every_5min' | 'off';
  paceAlerts: boolean;
  voiceRate: number;
  displayStats: ('pace' | 'distance' | 'time' | 'calories' | 'elevation' | 'heartRate' | 'avgPace' | 'cadence')[];
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
  { type: 'freerun', label: 'Free Run', icon: '🏃', description: 'Run at your own pace' },
  { type: 'easy', label: 'Easy Run', icon: '🚶', description: 'Recovery pace, conversational' },
  { type: 'tempo', label: 'Tempo Run', icon: '⚡', description: 'Comfortably hard, sustained effort' },
  { type: 'intervals', label: 'Intervals', icon: '🔄', description: 'High-intensity repeats with rest' },
  { type: 'long', label: 'Long Run', icon: '🛤️', description: 'Distance-focused, steady pace' },
  { type: 'race', label: 'Race', icon: '🏁', description: 'All-out effort, distance goal' },
  { type: 'treadmill', label: 'Treadmill', icon: '🏋️', description: 'Indoor, no GPS needed' },
];

interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
}

export default function RunSetupModal({ onStart, onCancel, savedPreferences }: RunSetupModalProps) {
  const [config, setConfig] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...savedPreferences });

  const updateConfig = (partial: Partial<RunConfig>) => setConfig((prev) => ({ ...prev, ...partial }));
  const intervalConfig = config.intervals ?? { reps: 5, workDistance: 1000, restDuration: 90 };

  return (
    <div className="flex-1 flex flex-col">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 pb-40">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3 self-start active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-extrabold tracking-tight mb-1">Choose your run</h2>
        <p className="text-sm text-muted-foreground mb-4">Select workout type</p>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {ACTIVITY_TYPES.map((at) => (
            <button
              key={at.type}
              onClick={() => updateConfig({ activityType: at.type })}
              className={`p-3.5 rounded-xl border-2 text-left transition-all pressable ${
                config.activityType === at.type
                  ? 'border-primary bg-primary/10 shadow-[0_0_0_2px_rgba(139,92,246,0.3)]'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <span className="text-xl">{at.icon}</span>
              <p className="text-sm font-bold mt-1.5">{at.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{at.description}</p>
            </button>
          ))}
        </div>

        {config.activityType === 'intervals' && (
          <div className="mb-6 p-4 rounded-xl bg-card border border-border space-y-3">
            <h3 className="text-sm font-semibold">Interval Setup</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground">Repeats</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={intervalConfig.reps}
                  onChange={(e) => updateConfig({ intervals: { ...intervalConfig, reps: Number(e.target.value) } })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Work Distance (m)</label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={intervalConfig.workDistance ?? 1000}
                  onChange={(e) =>
                    updateConfig({ intervals: { ...intervalConfig, workDistance: Number(e.target.value) } })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Rest (seconds)</label>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={intervalConfig.restDuration}
                  onChange={(e) =>
                    updateConfig({ intervals: { ...intervalConfig, restDuration: Number(e.target.value) } })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Target Pace (/km)</label>
                <input
                  type="text"
                  placeholder="4:30"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                  onChange={(e) => {
                    const [m, s] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(m) && Number.isFinite(s)) {
                      updateConfig({ intervals: { ...intervalConfig, workPace: m * 60 + s } });
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {config.activityType !== 'intervals' && config.activityType !== 'treadmill' && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">Set a target (optional)</h3>
            <div className="flex gap-2">
              {(['none', 'distance', 'time', 'pace'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    updateConfig({
                      target: {
                        type: t,
                        value: t === 'distance' ? 5 : t === 'time' ? 1800 : t === 'pace' ? 330 : undefined,
                      },
                    })
                  }
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                    config.target.type === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t === 'none' ? 'None' : t === 'distance' ? 'Distance' : t === 'time' ? 'Time' : 'Pace'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
            <span className="text-sm">Auto-pause</span>
            <button
              onClick={() => updateConfig({ autoPause: !config.autoPause })}
              className={`w-11 h-6 rounded-full transition-colors ${config.autoPause ? 'bg-primary' : 'bg-muted'}`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  config.autoPause ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
            <span className="text-sm">Audio cues</span>
            <button
              onClick={() => updateConfig({ audioCues: !config.audioCues })}
              className={`w-11 h-6 rounded-full transition-colors ${config.audioCues ? 'bg-primary' : 'bg-muted'}`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  config.audioCues ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {config.audioCues && (
            <>
              <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                <span className="text-sm">Pace alerts</span>
                <button
                  onClick={() => updateConfig({ paceAlerts: !config.paceAlerts })}
                  className={`w-11 h-6 rounded-full transition-colors ${config.paceAlerts ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      config.paceAlerts ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border">
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
        </div>
      </div>

      {/* Sticky bottom action area */}
      <div className="sticky bottom-0 px-6 pt-3 pb-4 bg-gradient-to-t from-background from-80% to-transparent safe-area-pb">
        <div className="space-y-2">
          <button
            onClick={() => onStart(config)}
            className="btn-start-run-pulse w-full py-4 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-bold text-lg shadow-[var(--ds-shadow-orange-glow)] active:scale-95 transition-transform"
          >
            {config.activityType === 'treadmill' ? '🏋️ Start Treadmill' : '🏃 Start Run'}
          </button>
          <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
