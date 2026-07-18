/**
 * Social page tab vocabulary (SOCIAL-HOME-01) — its own module so the
 * views can type against it without importing the page (which imports
 * the views: that was a madge-flagged import cycle, type-only but
 * still a cycle in the module graph).
 *
 * Legacy note: ?tab=crews and ?tab=find are ACCEPTED in URLs (crews →
 * together, find → the People overlay) but are not representable
 * states — SocialTab is only what the tab bar can show.
 */
export type SocialTab = "together" | "feed";
export type FeedSubTab = "following" | "explore";
