import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { KICKER_CLASS, type SiteDomain } from "@/website/site/domains";

/** The soft light behind the hero's picture (§14o): one per page. */
const LIGHT_CLASS: Record<SiteDomain, string> = {
  lifting: "site-light site-light-lifting",
  running: "site-light site-light-running",
  food: "site-light site-light-food",
  brand: "site-light site-light-lifting",
};

/**
 * The opening of a section page: a kicker naming the section in its
 * colour, the page's one headline, its line, and its picture (a screen of
 * the app) in the section's one light. The headline is the page's largest
 * text (§14m rule 2).
 */
export default function PageHero({
  domain,
  kicker,
  heading,
  line,
  picture,
  children,
}: {
  domain: SiteDomain;
  kicker: string;
  heading: string;
  line: string;
  picture: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden">
      <div className="mx-auto grid max-w-[70rem] items-center gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-16">
        <div>
          <p
            className={cn(
              "text-[0.9375rem] font-semibold",
              KICKER_CLASS[domain]
            )}
          >
            {kicker}
          </p>
          <h1 className="mt-3 text-h1 font-extrabold leading-[1.08] tracking-tight text-foreground text-balance lg:text-[3.5rem]">
            {heading}
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">
            {line}
          </p>
          {children}
        </div>
        <div
          className={cn(
            "mx-auto w-full max-w-[17.5rem] lg:max-w-[20rem]",
            LIGHT_CLASS[domain]
          )}
        >
          {picture}
        </div>
      </div>
    </section>
  );
}
