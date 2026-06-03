/**
 * Canonical default ("system") crews.
 *
 * These four crews are app-provided, owned by `createdBy: "system"`, and seen
 * by every user on the Social → Crews tab. They are provisioned ONCE, server
 * side, by `scripts/seed-default-crews.ts` (Admin SDK) — NOT by the client.
 *
 * Why not the client: the `/groups` create rule requires
 * `createdBy == request.auth.uid` (so users can't attribute crews to other
 * accounts). A "system"-owned crew can never satisfy that from a client write,
 * so the old client-side seed in `useCrews` was permission-denied on every
 * first `/social` load — flooding the console and leaving the crew list empty
 * (issue #846). Seeding belongs to the privileged Admin SDK, which bypasses
 * rules; the client only ever reads these and creates user-owned crews.
 *
 * This module is dependency-free (plain data) so BOTH the client bundle and the
 * Node seed script can import it — one source of truth, no drift.
 */

export interface DefaultCrewSeed {
  name: string;
  description: string;
  icon: string;
  leaderboardMetric: string;
  type: "default";
  /** Always "system" — app-owned, not attributable to any user account. */
  createdBy: "system";
}

export const DEFAULT_CREWS: DefaultCrewSeed[] = [
  {
    name: "Hybrid Athletes",
    description: "Lift and run — best of both worlds",
    icon: "dumbbell",
    leaderboardMetric: "hybrid_score",
    type: "default",
    createdBy: "system",
  },
  {
    name: "Runners",
    description: "Road, trail, track — all distances welcome",
    icon: "footprints",
    leaderboardMetric: "total_km",
    type: "default",
    createdBy: "system",
  },
  {
    name: "Lifters",
    description: "Strength, power, and muscle",
    icon: "dumbbell",
    leaderboardMetric: "total_volume",
    type: "default",
    createdBy: "system",
  },
  {
    name: "General Fitness",
    description: "Stay active, stay healthy",
    icon: "star",
    leaderboardMetric: "workout_count",
    type: "default",
    createdBy: "system",
  },
];
