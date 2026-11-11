/** Shared feed display shapes. Keep independent of hooks and data readers. */
export interface ActivityData {
  authorId?: string;
  authorName?: string;
  type?: string;
  distance?: number;
  avgPace?: number | string;
  duration?: number;
  elevationGain?: number;
  routePreview?: { lat: number; lon: number }[];
  /** The run's map image in each theme (Soc15 call 5), once made. */
  routeMap?: { light?: unknown; dark?: unknown };
  /** The author's photos of the session (Soc15 call 2), read with
   *  `postPhotosOf`. */
  photos?: unknown;
  totalVolume?: number;
  exerciseCount?: number;
  muscleGroups?: string[];
  commentCount?: number;
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  badgeEarned?: string;
  challengeMilestone?: string;
  kudosCount?: number;
  exercises?: { name: string; summary: string }[];
  prCount?: number;
  activityTitle?: string;
  [key: string]: unknown;
}

export interface FeedItem {
  id: string;
  activityId: string;
  authorId: string;
  authorName: string;
  /** From the access-controlled parent activity, as are all display fields. */
  authorPhotoURL?: string;
  type: "run" | "workout";
  summary: string;
  createdAt: { toDate: () => Date } | unknown;
  // Enriched at feed level — no per-card reads needed
  activity?: ActivityData;
  liked?: boolean;
  kudosCount?: number;
  // Highlight fields for filtering
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  badgeEarned?: string;
  challengeMilestone?: string;
}
