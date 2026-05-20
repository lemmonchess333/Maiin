import { useCallback, type ReactNode } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { track as trackSettingsEvent, type SettingsSection } from "@/lib/settingsAnalytics";

interface TrackSettingsSectionViewProps {
  /** Section identifier matching the SettingsSection union — fires
   *  as the `section` dimension on `settings_section_viewed`. */
  section: SettingsSection;
  children: ReactNode;
}

/**
 * Wrapper that emits `settings_section_viewed` exactly once when
 * the wrapped section first crosses ~50% into the viewport. Same
 * pattern as Home2's TrackSectionView (PR #620) and Pgm3's
 * TrackProgrammeSectionView (PR #623) — pinned to the
 * settingsAnalytics shim so the event union stays page-scoped.
 *
 * Why IntersectionObserver over accordion-expand: most Settings
 * sections aren't accordions (ProfileInfo, Nutrition, WorkoutPrefs,
 * etc.) — they render inline as the user scrolls. Using
 * "scrolled into view" as the signal gives uniform coverage across
 * the page. Accordion-expand telemetry stays available on
 * AccordionSection via its onFirstOpen prop if a future slice
 * wants the more-engaged signal for the Training accordion.
 */
export default function TrackSettingsSectionView({
  section,
  children,
}: TrackSettingsSectionViewProps) {
  const onView = useCallback(() => {
    trackSettingsEvent("settings_section_viewed", { section });
  }, [section]);
  const ref = useInViewOnce(onView);
  return <div ref={ref}>{children}</div>;
}
