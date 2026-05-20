import { useCallback, type ReactNode } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { track as trackHomeEvent, type HomeSection } from "@/lib/homeAnalytics";

interface TrackSectionViewProps {
  /** Section identifier matching the HomeSection union — fires as
   *  the `section` dimension on the `home_section_viewed` event. */
  section: HomeSection;
  children: ReactNode;
}

/**
 * Wrapper that emits `home_section_viewed` exactly once when the
 * wrapped section first crosses ~50% into the viewport. Mounting
 * a hidden / lazy section that never scrolls into view means the
 * event never fires — that's the correct semantic (the user didn't
 * actually see the section).
 *
 * Adds a single `<div>` with the ref. Doesn't add any layout
 * styling so it slots into the existing Home.tsx render tree
 * without rearranging anything.
 */
export default function TrackSectionView({ section, children }: TrackSectionViewProps) {
  const onView = useCallback(() => {
    trackHomeEvent("home_section_viewed", { section });
  }, [section]);
  const ref = useInViewOnce(onView);
  return <div ref={ref}>{children}</div>;
}
