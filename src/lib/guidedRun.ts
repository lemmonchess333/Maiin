/**
 * Guided Run Engine — structured workouts with segment-by-segment coaching.
 */

export type SegmentType =
  | "warmup"
  | "easy"
  | "moderate"
  | "hard"
  | "recovery"
  | "cooldown";

export interface RunSegment {
  type: SegmentType;
  durationSeconds: number;
  label: string;
  instruction: string;
}

export interface GuidedRunWorkout {
  id: string;
  name: string;
  description: string;
  totalMinutes: number;
  difficulty: "easy" | "moderate" | "hard";
  color: string;
  segments: RunSegment[];
}

export interface GuidedRunAuditIssue {
  workoutId: string;
  code:
    | "workout_id_blank"
    | "workout_id_duplicate"
    | "segment_missing"
    | "segment_duration_non_positive"
    | "segment_label_blank"
    | "segment_instruction_blank"
    | "total_duration_mismatch";
  message: string;
}

const SEGMENT_COLORS: Record<SegmentType, string> = {
  warmup: "#e09510",
  easy: "#22b558",
  moderate: "#3b7ee6",
  hard: "#e04040",
  recovery: "#7B72E9",
  cooldown: "#06a8c8",
};

export function getSegmentColor(type: SegmentType): string {
  return SEGMENT_COLORS[type];
}

export const GUIDED_WORKOUTS: GuidedRunWorkout[] = [
  {
    id: "easy-30",
    name: "Easy 30",
    description: "A gentle 30-minute run to build your aerobic base",
    totalMinutes: 30,
    difficulty: "easy",
    color: "#22c55e",
    segments: [
      {
        type: "warmup",
        durationSeconds: 300,
        label: "Warm Up",
        instruction: "Walk briskly, then a gentle jog",
      },
      {
        type: "easy",
        durationSeconds: 1200,
        label: "Easy Run",
        instruction:
          "Comfortable pace — you should be able to hold a conversation",
      },
      {
        type: "cooldown",
        durationSeconds: 300,
        label: "Cool Down",
        instruction: "Slow jog, then walk to finish",
      },
    ],
  },
  {
    id: "build-speed",
    name: "Build Speed",
    description:
      "Progressive tempo — start easy and gradually pick up the pace",
    totalMinutes: 35,
    difficulty: "moderate",
    color: "#3b82f6",
    segments: [
      {
        type: "warmup",
        durationSeconds: 300,
        label: "Warm Up",
        instruction: "Easy jog to loosen up",
      },
      {
        type: "easy",
        durationSeconds: 480,
        label: "Easy Pace",
        instruction: "Find a comfortable rhythm",
      },
      {
        type: "moderate",
        durationSeconds: 480,
        label: "Pick It Up",
        instruction: "Increase pace — comfortably hard",
      },
      {
        type: "hard",
        durationSeconds: 300,
        label: "Push It",
        instruction: "Strong effort — 8 out of 10",
      },
      {
        type: "recovery",
        durationSeconds: 180,
        label: "Recover",
        instruction: "Slow right down, catch your breath",
      },
      {
        type: "hard",
        durationSeconds: 180,
        label: "Final Push",
        instruction: "Last effort — give it everything!",
      },
      {
        type: "cooldown",
        durationSeconds: 180,
        label: "Cool Down",
        instruction: "Easy jog to walk, well done!",
      },
    ],
  },
  {
    id: "hard-and-fast",
    name: "Hard & Fast",
    description: "High-intensity intervals — short bursts with rest periods",
    totalMinutes: 30,
    difficulty: "hard",
    color: "#ef4444",
    segments: [
      {
        type: "warmup",
        durationSeconds: 420,
        label: "Warm Up",
        instruction: "Easy jog with dynamic stretches",
      },
      {
        type: "hard",
        durationSeconds: 60,
        label: "Sprint 1",
        instruction: "90% effort — go!",
      },
      {
        type: "recovery",
        durationSeconds: 90,
        label: "Recover",
        instruction: "Walk or slow jog",
      },
      {
        type: "hard",
        durationSeconds: 60,
        label: "Sprint 2",
        instruction: "90% effort — strong arms!",
      },
      {
        type: "recovery",
        durationSeconds: 90,
        label: "Recover",
        instruction: "Catch your breath",
      },
      {
        type: "hard",
        durationSeconds: 60,
        label: "Sprint 3",
        instruction: "Stay tall, drive knees!",
      },
      {
        type: "recovery",
        durationSeconds: 90,
        label: "Recover",
        instruction: "Walk it off",
      },
      {
        type: "hard",
        durationSeconds: 60,
        label: "Sprint 4",
        instruction: "Almost there — push hard!",
      },
      {
        type: "recovery",
        durationSeconds: 90,
        label: "Recover",
        instruction: "You've got this",
      },
      {
        type: "hard",
        durationSeconds: 60,
        label: "Sprint 5",
        instruction: "Last one — leave nothing!",
      },
      {
        type: "recovery",
        durationSeconds: 90,
        label: "Recover",
        instruction: "Great work, slow it down",
      },
      {
        type: "moderate",
        durationSeconds: 450,
        label: "Tempo Finish",
        instruction: "Moderate pace to burn out",
      },
      {
        type: "cooldown",
        durationSeconds: 180,
        label: "Cool Down",
        instruction: "Easy jog to walk, done!",
      },
    ],
  },
];

export function auditGuidedWorkouts(
  workouts: GuidedRunWorkout[]
): GuidedRunAuditIssue[] {
  const issues: GuidedRunAuditIssue[] = [];
  const idCounts = new Map<string, number>();

  for (const workout of workouts) {
    const id = workout.id.trim();
    if (!id) {
      issues.push({
        workoutId: workout.id,
        code: "workout_id_blank",
        message: "Workout id cannot be blank.",
      });
    } else {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    if (workout.segments.length === 0) {
      issues.push({
        workoutId: workout.id,
        code: "segment_missing",
        message: "Workout must include at least one segment.",
      });
    }

    let segmentDurationTotal = 0;
    for (const [index, segment] of workout.segments.entries()) {
      segmentDurationTotal += segment.durationSeconds;

      if (segment.durationSeconds <= 0) {
        issues.push({
          workoutId: workout.id,
          code: "segment_duration_non_positive",
          message: `Segment ${index + 1} duration must be > 0 seconds.`,
        });
      }
      if (!segment.label.trim()) {
        issues.push({
          workoutId: workout.id,
          code: "segment_label_blank",
          message: `Segment ${index + 1} label cannot be blank.`,
        });
      }
      if (!segment.instruction.trim()) {
        issues.push({
          workoutId: workout.id,
          code: "segment_instruction_blank",
          message: `Segment ${index + 1} instruction cannot be blank.`,
        });
      }
    }

    const declaredSeconds = workout.totalMinutes * 60;
    if (segmentDurationTotal !== declaredSeconds) {
      issues.push({
        workoutId: workout.id,
        code: "total_duration_mismatch",
        message: `Declared total (${declaredSeconds}s) does not match segment sum (${segmentDurationTotal}s).`,
      });
    }
  }

  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      issues.push({
        workoutId: id,
        code: "workout_id_duplicate",
        message: `Workout id "${id}" is duplicated ${count} times.`,
      });
    }
  }

  return issues;
}
