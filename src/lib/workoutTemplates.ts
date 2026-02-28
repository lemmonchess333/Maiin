export interface RunTemplate {
  id: string;
  name: string;
  type: 'easy' | 'tempo' | 'intervals' | 'long' | 'race';
  icon: string;
  description: string;
  estimatedDuration: number;
  config: {
    targetPace?: number;
    targetDistance?: number;
    intervals?: {
      reps: number;
      workDistance?: number;
      workDuration?: number;
      restDuration: number;
      warmupDuration?: number;
      cooldownDuration?: number;
    };
  };
}

export const RUN_TEMPLATES: RunTemplate[] = [
  { id: 'easy_30', name: 'Easy 30', type: 'easy', icon: '🚶', description: '30 min easy pace — recovery day', estimatedDuration: 30, config: {} },
  { id: 'tempo_20', name: '20 Min Tempo', type: 'tempo', icon: '⚡', description: '5 min warmup → 20 min tempo → 5 min cooldown', estimatedDuration: 30, config: { targetPace: 270 } },
  { id: '5x1k', name: '5×1K Intervals', type: 'intervals', icon: '🔄', description: '5 reps of 1km hard with 90s rest', estimatedDuration: 35, config: { intervals: { reps: 5, workDistance: 1000, restDuration: 90, warmupDuration: 300, cooldownDuration: 300 } } },
  { id: '8x400', name: '8×400m Speed', type: 'intervals', icon: '💨', description: '8 reps of 400m with 60s rest', estimatedDuration: 25, config: { intervals: { reps: 8, workDistance: 400, restDuration: 60, warmupDuration: 300, cooldownDuration: 300 } } },
  { id: 'long_10k', name: 'Long 10K', type: 'long', icon: '🛤️', description: '10km at easy-to-moderate pace', estimatedDuration: 55, config: { targetDistance: 10 } },
  { id: 'long_15k', name: 'Long 15K', type: 'long', icon: '🛤️', description: '15km steady state', estimatedDuration: 80, config: { targetDistance: 15 } },
  { id: '5k_race', name: '5K Race', type: 'race', icon: '🏁', description: 'All-out 5km effort', estimatedDuration: 25, config: { targetDistance: 5 } },
];
