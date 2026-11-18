import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A website page's one headline: the hero's words at the website's scale
 * (`.site-h1`, 36 px on a phone and 56 px wide; the website’s design (#3428),
 * "The look"), not the app's page-title token, which a hero would read
 * as small print at 1440 px. Every website page draws its h1 here, so
 * `designSystemInvariants.test.ts` counts this file once, as it does the
 * app's `PageShell`.
 */
export default function SiteHeadline({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <h1 id={id} className={cn("site-h1", className)}>
      {children}
    </h1>
  );
}
