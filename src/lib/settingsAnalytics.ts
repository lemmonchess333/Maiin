/**
 * Settings page analytics — thin event-tracking shim.
 *
 * Same pattern as the other Page-IA analytics modules
 * (paywallAnalytics, foodAnalytics, socialAnalytics,
 * historyAnalytics, homeAnalytics, programmeAnalytics). Tropos has
 * no analytics provider wired today, so this module is a no-op-safe
 * wrapper: call sites emit structured events from day one, and when
 * a provider lands swap the body of `track()` to forward through it
 * without touching the call sites.
 */

import { logger } from "./logger";

export type SettingsEvent =
  | "settings_section_viewed"
  | "settings_toggle_changed";

/** Top-level accordion sections on the Settings page. Pinned so
 *  dashboards can key off a closed vocabulary rather than free-form
 *  strings. */
export type SettingsSection =
  | "profile_info"
  | "training"
  | "nutrition"
  | "workout_prefs"
  | "units_appearance"
  | "privacy"
  | "shoes"
  | "notifications"
  | "subscription"
  | "data_storage"
  | "account";

/** Toggles / switches a user can flip on Settings. Closed vocab so a
 *  dashboard can map each event to a known control without parsing
 *  free-form keys. */
export type SettingsToggle =
  | "auto_rest_timer"
  | "auto_post_runs"
  | "weekly_summary_email"
  | "default_visibility"
  | "weight_unit"
  | "distance_unit"
  | "theme"
  | "meal_reminders"
  | "workout_reminders";

export interface SettingsEventMetadata {
  /** settings_section_viewed: which accordion section the user
   *  expanded (counts as "viewed" — the body content only renders
   *  on expand, so a closed accordion isn't really viewed). */
  section?: SettingsSection;
  /** settings_toggle_changed: which control the user flipped. */
  toggle?: SettingsToggle;
  /** settings_toggle_changed: the new value (boolean toggles flip
   *  on/off; enum toggles like theme send the picked variant as
   *  a string). */
  value?: boolean | string;
}

export function track(
  event: SettingsEvent,
  metadata: SettingsEventMetadata = {},
): void {
  try {
    logger.log(`[settings] ${event}`, metadata as Record<string, unknown>);
  } catch (err) {
    logger.warn("[settings] track failed", { event, err: String(err) });
  }
}
