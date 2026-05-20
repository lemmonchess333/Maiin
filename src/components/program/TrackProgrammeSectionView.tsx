import { useCallback, type ReactNode } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { track as trackProgrammeEvent, type ProgrammeSection } from "@/lib/programmeAnalytics";

interface TrackProgrammeSectionViewProps {
  /** Section identifier matching the ProgrammeSection union — fires
   *  as the `section` dimension on the `programme_section_viewed`
   *  event. */
  section: ProgrammeSection;
  children: ReactNode;
}

/**
 * Wrapper that emits `programme_section_viewed` exactly once when
 * the wrapped section first crosses ~50% into the viewport. Mirrors
 * Home2's TrackSectionView but pinned to the programmeAnalytics
 * shim so the event union stays page-scoped.
 *
 * Sister component: src/components/home/TrackSectionView.tsx
 * Shared primitive:  src/hooks/useInViewOnce.ts (PR #620)
 */
export default function TrackProgrammeSectionView({
  section,
  children,
}: TrackProgrammeSectionViewProps) {
  const onView = useCallback(() => {
    trackProgrammeEvent("programme_section_viewed", { section });
  }, [section]);
  const ref = useInViewOnce(onView);
  return <div ref={ref}>{children}</div>;
}
