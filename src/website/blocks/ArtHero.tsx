import type { ReactNode } from "react";
import AppStoreBadge from "@/website/AppStoreBadge";
import SiteHeadline from "@/website/blocks/SiteHeadline";

/** The sports' colours, as tokens, for the light behind a drawing. */
export type SportLight = "lifting" | "running" | "nutrition" | "primary";

/**
 * A product page's hero: a kicker in the sport's colour, the page's
 * headline, one or two sentences and the App Store badge, beside the
 * app's own drawing of the sport in one soft light of its colour
 * (DESIGN_GUIDE §14o). On a phone the drawing comes first and the badge
 * still lands in the first screen.
 */
export default function ArtHero({
  kicker,
  kickerClass,
  title,
  lede,
  art,
  artAlt = "",
  picture,
  light,
  note,
}: {
  kicker: string;
  /** The kicker's colour: the sport's strong step (AA on the page). */
  kickerClass: string;
  title: string;
  lede: ReactNode;
  /** The sport's drawing, from public/ (form-art, food-art). */
  art?: string;
  artAlt?: string;
  /** In place of a drawing: an app screen or a photograph. */
  picture?: ReactNode;
  light: SportLight;
  /** A line under the badge. */
  note?: ReactNode;
}) {
  return (
    <section className="site-container grid items-center gap-6 pt-2 pb-4 md:grid-cols-2 md:gap-12 md:pt-10 md:pb-14 lg:pb-24">
      <div className="md:order-2">
        <div
          className={
            picture
              ? "art-hero-frame"
              : "art-hero-picture max-h-[34svh] md:max-h-none"
          }
          data-light={light}
        >
          {picture ?? (
            <img
              src={art}
              alt={artAlt}
              width={480}
              height={480}
              decoding="async"
              fetchPriority="high"
            />
          )}
        </div>
      </div>
      <div className="md:order-1">
        <p className={`site-kicker ${kickerClass}`}>{kicker}</p>
        <SiteHeadline className="mt-2">{title}</SiteHeadline>
        <p className="site-lede mt-4 text-muted-foreground max-w-[34rem]">
          {lede}
        </p>
        <div className="mt-5">
          <AppStoreBadge />
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
    </section>
  );
}
