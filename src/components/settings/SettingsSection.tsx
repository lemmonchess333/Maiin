/**
 * SettingsSection — wrapper for nested settings pages (Set1.1).
 *
 * Provides the page chrome for an iOS-style nested settings screen:
 * back arrow → /settings, page title, content slot. Consumers render
 * their section-specific controls as children.
 *
 * Pattern (from Set1 locked decision — iOS Settings nested pages):
 *
 *   /settings              → SettingsIndex (top-level list with chevrons)
 *   /settings/<slug>       → SettingsSection wrapping the section UI
 *
 * The back-arrow always routes to /settings rather than browser back
 * so the user lands at the index regardless of how they navigated in
 * (e.g. deeplinks from Programme → /settings/training shouldn't pop
 * back to Programme, they should pop to Settings).
 */
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { haptic } from "@/lib/haptic";
import TrackSettingsSectionView from "./TrackSettingsSectionView";
import type { SettingsSection as SettingsSectionId } from "@/lib/settingsAnalytics";

interface SettingsSectionProps {
  title: string;
  /** Optional one-line description rendered under the title. */
  subtitle?: string;
  /**
   * Analytics id. When given, emits `settings_section_viewed` once, the
   * first time the content crosses into view.
   *
   * Threaded HERE rather than at each page's JSX because this component is
   * already the one chrome every nested settings page renders — so the
   * wrapper goes in once and each page adds a prop, instead of twelve
   * near-identical hand-wrapped edits that can silently disagree.
   *
   * NOTE the semantics shifted with the Set1.2 nested IA and the dashboard
   * should be read accordingly. `TrackSettingsSectionView` was built when
   * Settings was ONE page and sections scrolled past; now each section IS a
   * page, so the event means "opened this settings page" rather than
   * "scrolled past this section". That is the more useful of the two, and
   * it is worth stating because the event name no longer says it.
   *
   * Optional so the defensive empty-chrome states (rendered while a profile
   * is still loading) don't fire a view for a page that showed nothing.
   */
  section?: SettingsSectionId;
  /** Optional. Empty when the consumer is rendering a defensive
   *  empty-chrome state (e.g. while the profile is still loading). */
  children?: ReactNode;
}

export default function SettingsSection({
  title,
  subtitle,
  section,
  children,
}: SettingsSectionProps) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4 pb-8">
      {/* Back-arrow row. Lives above the page title so a tall content
          block can scroll under the back affordance without obscuring
          it. Touch target meets the 44px floor. */}
      <button
        type="button"
        onClick={() => {
          haptic();
          navigate("/settings");
        }}
        aria-label="Back to Settings"
        className="inline-flex items-center gap-1 -ml-2 p-2 min-h-[44px] rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-95"
      >
        <ChevronLeft className="size-5" />
        <span>Settings</span>
      </button>

      <header className="space-y-1">
        {/* text-xl, not text-h2 (DS2, 2026-08-22). Every other page title
            in the app — the Settings index these pages drill down FROM
            included — is text-xl (20px), so the 15 nested pages rendered
            their titles a full tier LARGER than their parent. CLAUDE.md's
            31px H1 row was aspirational and used by nothing; the de facto
            tier is the standard. */}
        <h1 className="text-xl font-extrabold text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>

      <div className="space-y-4">
        {section ? (
          <TrackSettingsSectionView section={section}>
            {children}
          </TrackSettingsSectionView>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
