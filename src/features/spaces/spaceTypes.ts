/**
 * Community Spaces — Firestore document shapes (Spc1, locked 2026-07-12).
 *
 * Paths:
 *   spaces/{spaceId}/members/{uid}   — membership (client-owned join/leave)
 *   spaces/{spaceId}/posts/{postId}  — member posts
 *
 * There is deliberately NO spaces/{spaceId} parent doc in v1: the
 * space definitions are client config (spaceDefs.ts) and member counts
 * come from a client aggregate count over the members subcollection —
 * no forgeable counter field, no trigger, no at-least-once machinery.
 * (Deviation from the challenge participantCount pattern, noted in the
 * Spc1 PR1 review: an aggregate query is strictly safer than a
 * server-owned mirror when nothing else consumes the number.)
 *
 * likeCount / commentCount on posts ARE stored fields but are
 * SERVER-OWNED (rules deny any client diff touching them) — they wire
 * up via callables in the PR3 slice, mirroring the kudos lockdown.
 */
import type { Timestamp } from "firebase/firestore";

export interface SpaceMemberDoc {
  joinedAt: Timestamp;
  /** Denormalised identity for member lists (challenge-participant
   *  idiom) — optional, cosmetic, rules-capped. */
  displayName?: string;
  photoURL?: string;
  /** If mirrored into the body it must equal the doc id (rules pin). */
  uid?: string;
}

/** Denormalised snapshot of an attached logged session — captured at
 *  post time (feed idiom: render without N follow-up reads). Renders
 *  with the ActivityCard hero art (route scene / muscle figure). */
export interface SpacePostActivitySnapshot {
  type: "run" | "workout";
  distance?: number;
  avgPace?: number;
  duration?: number;
  elevationGain?: number;
  routePreview?: { lat: number; lon: number }[];
  totalVolume?: number;
  exerciseCount?: number;
  muscleGroups?: string[];
}

export interface SpacePostDoc {
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  /** Optional headline (Runna posts often lead with one). */
  title?: string;
  body: string;
  activity?: SpacePostActivitySnapshot;
  /** PR4 slice — download URL under space-photos/{authorId}/. */
  photoUrl?: string;
  /** Tropos Team badge — rules-validated against
   *  system/config.officialUids; unforgeable by ordinary clients. */
  official?: boolean;
  /** Pinned to the top of the space — official-only write. */
  pinned?: boolean;
  /** Server-owned engagement counters (PR3 callables). */
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp;
}
