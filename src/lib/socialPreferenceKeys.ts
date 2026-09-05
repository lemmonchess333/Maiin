/**
 * SOCIAL-ATTENTION-01 — uid-scoped localStorage keys for Social
 * "attention" preferences (unread-badge last-seen, per-sub-tab
 * new-content pointers).
 *
 * Why this exists: these preferences were stored under GLOBAL keys
 * (`tropos-social-last-seen`, `tropos-social-feed-*-last-viewed`).
 * On a shared browser, account B inherited account A's pointers —
 * B's unread badge could read as "all seen" the instant it signed
 * in. Scoping every key by uid closes that cross-account bleed, mirroring the notification tray fix (NOTIFICATION-TRUST-01)
 * and the offline/share-queue uid-scoping (PR #820).
 *
 * Migration: the old global keys are deliberately NOT migrated — a
 * shared browser can't prove which account last wrote them, so
 * carrying the value forward would re-introduce the bleed. `purgeLegacy*`
 * deletes them on first read instead (worst case: a one-time re-surfacing
 * of up-to-a-page of "unread", the intended privacy-first trade-off).
 */

import { remove } from "@/lib/localStore";

/** The uid-scoped key family. Value shape is owned by each hook. */
export type SocialPrefFamily =
  | "unread-last-seen"
  | "feed-following-last-viewed"
  | "feed-explore-last-viewed";

const PREFIX = "tropos-social";

/** Legacy GLOBAL keys, kept only so they can be purged on read. */
const LEGACY_KEYS: Record<SocialPrefFamily, string> = {
  "unread-last-seen": "tropos-social-last-seen",
  "feed-following-last-viewed": "tropos-social-feed-following-last-viewed",
  "feed-explore-last-viewed": "tropos-social-feed-explore-last-viewed",
};

/** The uid-scoped storage key for a given preference family. */
export function socialPreferenceKey(
  uid: string,
  family: SocialPrefFamily
): string {
  return `${PREFIX}:${family}:${uid}`;
}

/**
 * Delete the pre-uid-scoping GLOBAL key for a family. Safe to call on
 * every read — a missing key is a no-op, and the value is never
 * migrated forward (see module doc). Swallows storage failures
 * (Safari private mode / quota).
 */
export function purgeLegacySocialKey(family: SocialPrefFamily): void {
  if (typeof window === "undefined") return;
  remove(LEGACY_KEYS[family]);
}
