import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One thing the app does: a heading, a few plain sentences, and, beside
 * them, the app doing it. On a wide window the picture takes the left or
 * the right in turn (`flip`); on a phone the words come first.
 */
export default function FeatureSection({
  id,
  heading,
  children,
  picture,
  flip = false,
}: {
  id?: string;
  heading: string;
  children: ReactNode;
  picture?: ReactNode;
  flip?: boolean;
}) {
  return (
    <section
      id={id}
      className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
    >
      <div
        className={cn(
          "grid items-center gap-10",
          picture && "lg:grid-cols-2 lg:gap-20"
        )}
      >
        <div className={cn("max-w-xl", flip && picture && "lg:order-2")}>
          <h2 className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground text-balance lg:text-[2.5rem]">
            {heading}
          </h2>
          <div className="site-prose mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
        {picture && (
          <div
            className={cn(
              "mx-auto w-full max-w-[17.5rem] lg:max-w-[19rem]",
              flip && "lg:order-1"
            )}
          >
            {picture}
          </div>
        )}
      </div>
    </section>
  );
}
