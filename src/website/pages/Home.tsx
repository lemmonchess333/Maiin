import { ArrowRight } from "lucide-react";
import { FREE_KEEPS } from "@/components/paywall/proIncludesCopy";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { APP_STORE_URL } from "@/lib/publicLinks";
import AppStoreBadge from "@/website/AppStoreBadge";
import { FOOD_ART, FORM_ART } from "@/website/site/art";
import WebsiteInvite from "@/website/WebsiteInvite";
import AppScreen from "@/website/site/AppScreen";
import FeatureSection from "@/website/site/FeatureSection";
import HeroPhotos from "@/website/site/HeroPhotos";
import { SITE_PROMISE } from "@/website/site/pages";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";
import type { LandingContext } from "@/website/websiteAddress";

const DAY: readonly {
  screen: keyof typeof SCREENS;
  heading: string;
  line: string;
}[] = [
  {
    screen: "home",
    heading: "Today’s session",
    line: "Home opens on the lift or run planned for today and how long it takes.",
  },
  {
    screen: "workout",
    heading: "Every set filled in",
    line: "Weights and reps arrive from what you lifted last time. One tap logs a set.",
  },
  {
    screen: "food",
    heading: "Food against your target",
    line: "What’s left of today’s calories, with protein, carbs and fat.",
  },
];

const SPORTS: readonly {
  href: string;
  name: string;
  line: string;
  art: string;
  artClass: string;
  edge: string;
}[] = [
  {
    href: "/lifting",
    name: "Lifting",
    line: "2 to 6 sessions a week, split to suit the days you have.",
    art: FORM_ART.benchPress,
    artClass: "h-28 w-auto",
    edge: "site-light site-light-lifting",
  },
  {
    href: "/running",
    name: "Running",
    line: "GPS runs, and race plans from 5K to 100K.",
    art: FORM_ART.runEasy,
    artClass: "h-32 w-auto",
    edge: "site-light site-light-running",
  },
  {
    href: "/food",
    name: "Food",
    line: "Type a meal, search or scan a barcode, against a daily target.",
    art: FOOD_ART.plate,
    artClass: "h-28 w-auto",
    edge: "site-light site-light-food",
  },
];

/**
 * troposfit.com's home page (App1 Q50 and Q52): the welcome's
 * photographs, its promise and Apple's badge (the page's one), then the
 * app doing a day's work, the week, the three parts, the people, and Pro.
 *
 * `context` is the line for the address that brought someone, when React
 * draws the page for it (`websiteAddress.ts`): a friend's invite with the
 * code to copy, or a Space's link. The page the build writes has none.
 * The checkout's return is the Pro page's (`/upgrade`).
 */
export default function HomePage({
  context = { invite: null, note: null },
}: {
  context?: LandingContext;
}) {
  const { invite, note } = context;
  return (
    <SiteLayout current="/" overPhoto>
      <section className="site-hero">
        <div className="site-hero-visual">
          <HeroPhotos />
          <div className="site-hero-screen">
            <div className="site-light site-light-lifting">
              <AppScreen screen={SCREENS.home} eager />
            </div>
          </div>
        </div>
        <div className="site-hero-body mx-auto w-full max-w-[70rem] px-4 pb-10 pt-28 lg:mx-0 lg:p-0">
          <div className="site-hero-copy flex max-w-[26rem] flex-col gap-3 lg:max-w-[34rem]">
            <div>
              {note === "space" && (
                <p className="mb-1.5 text-sm font-semibold text-stage-foreground">
                  Get Tropos on your iPhone to open this Space.
                </p>
              )}
              <h1 className="text-h1 font-extrabold leading-[1.08] tracking-tight text-stage-foreground text-balance lg:text-[3.75rem]">
                {SITE_PROMISE}
              </h1>
              <p className="mt-3 text-[1.0625rem] leading-relaxed text-stage-foreground/85 lg:text-lg">
                Answer a few questions and get a week of training and a daily
                calorie target that fit you. Tropos is an iPhone app.
              </p>
            </div>
            {invite && <WebsiteInvite code={invite} />}
            <AppStoreBadge />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="a-day"
        className="mx-auto max-w-[70rem] px-4 pb-6 pt-16 lg:px-8 lg:pt-24"
      >
        <h2
          id="a-day"
          className="max-w-xl text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground text-balance lg:text-[2.5rem]"
        >
          What a training day looks like
        </h2>
        <p className="mt-3 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          Three screens you use most days: the session, the sets and the food.
        </p>
        {/* It scrolls sideways on a phone, so it takes the keyboard too
            (axe, scrollable-region-focusable), as a named region. */}
        <div
          role="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label="Three screens of the app"
          className="site-strip mt-10"
        >
          <ul className="site-strip-row">
            {DAY.map((step) => (
              <li key={step.screen}>
                <AppScreen screen={SCREENS[step.screen]} />
                <h3 className="mt-5 text-lg font-bold text-foreground">
                  {step.heading}
                </h3>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                  {step.line}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FeatureSection
        heading="Lifting and running in one week"
        picture={<AppScreen screen={SCREENS.racePlan} />}
      >
        <p>
          Tell Tropos your goal, the days you can train, your equipment and your
          experience. It plans lift sessions for those days and fits your runs
          around them.
        </p>
        <p>
          Lifts go in order, so a missed day moves the next one along rather
          than skipping it. On a race plan, Adjust this week makes room when
          you’re unwell or busy, and the race date stays put.
        </p>
      </FeatureSection>

      <section
        aria-labelledby="three-parts"
        className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
      >
        <h2
          id="three-parts"
          className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.5rem]"
        >
          Lifting, running and food
        </h2>
        <ul className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {SPORTS.map((sport) => (
            <li key={sport.href}>
              <a
                href={sport.href}
                className="group flex h-full flex-col rounded-2xl bg-card p-4 card-shadow lg:p-5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <div
                  className={`flex h-36 items-end justify-center ${sport.edge}`}
                >
                  <img
                    src={sport.art}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={sport.artClass}
                  />
                </div>
                <h3 className="mt-5 flex items-center gap-2 text-xl font-bold text-foreground">
                  {sport.name}
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </h3>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                  {sport.line}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <FeatureSection
        heading="Your week, reviewed"
        flip
        picture={<AppScreen screen={SCREENS.review} />}
      >
        <p>
          Each Monday the weekly review shows what you did against what was
          planned: sessions, kilos lifted, kilometres run and days with food
          logged. It ends on the week ahead, with any change offered in one tap.
        </p>
        <p>
          A performance score from 0 to 100 sits on Progress, with your records,
          a map of the muscles you’ve trained and your weight trend.
        </p>
      </FeatureSection>

      <FeatureSection
        heading="Train alongside other people"
        picture={<AppScreen screen={SCREENS.feed} />}
      >
        <p>
          Share a session with the people who follow you, and give props and
          comments on theirs. Plan a run or a lift with a Circle of up to 8, and
          join a weekly league scored on how much of your own plan you did.
        </p>
        <p>
          <a
            href="/social"
            className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Circles, Spaces and leagues
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </p>
      </FeatureSection>

      <section
        aria-labelledby="free-and-pro"
        className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
      >
        <div className="rounded-2xl bg-card p-4 card-shadow lg:p-10">
          <h2
            id="free-and-pro"
            className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.25rem]"
          >
            What’s free and what Pro adds
          </h2>
          <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            {FREE_KEEPS} Pro adds a calorie target that adapts to you, macros
            that shift with your training, and logging a meal from a photo.
          </p>
          <a
            href="/pro"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline"
          >
            What Pro adds
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        aria-labelledby="first-week"
        className="border-t border-white/[0.06]"
      >
        <div className="mx-auto max-w-[70rem] px-4 py-16 lg:px-8 lg:py-24">
          <div className="max-w-xl">
            <h2
              id="first-week"
              className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground text-balance lg:text-[2.5rem]"
            >
              Your first week, planned in a few minutes
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
              Setup asks your goal, the days you can train, your equipment and
              your experience, and ends on your plan.
            </p>
            {/* The page's badge is at its top: Apple allows one a layout. */}
            <a
              href={APP_STORE_URL}
              className={buttonClasses({
                variant: "neutral",
                size: "lg",
                className: "mt-6 rounded-full px-6",
              })}
            >
              Get Tropos on the App Store
            </a>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
