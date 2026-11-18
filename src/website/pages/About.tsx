import GetTheApp from "@/website/site/GetTheApp";
import { KICKER_CLASS } from "@/website/site/domains";
import SiteLayout from "@/website/site/SiteLayout";

/** What Tropos holds to, each one true of the app as it is (the Privacy
 *  Policy, Food9 in CLAUDE.md, `StreakSheet`'s "no freezes, shields or
 *  tokens"). */
const HOLDS: readonly { heading: string; line: string }[] = [
  {
    heading: "No ads",
    line: "Tropos shows no adverts, doesn’t use your data for advertising and doesn’t sell it.",
  },
  {
    heading: "Meal photos stay on your phone",
    line: "With Pro you can log a meal from a photo. Google reads it once you’ve said yes, and the photo is kept only on your phone.",
  },
  {
    heading: "You choose who sees what",
    line: "Each session is shared with your followers, made public or kept to yourself, and every follower is someone you accepted.",
  },
  {
    heading: "Nothing to buy to save a streak",
    line: "Your plan’s rest days and one grace day in seven keep a streak going. There are no freezes, shields or tokens.",
  },
];

/** Whose work the app uses, as the app credits it where it appears. */
const CREDITS: readonly { name: string; href: string; what: string }[] = [
  {
    name: "OpenStreetMap",
    href: "https://www.openstreetmap.org/copyright",
    what: "map data, © OpenStreetMap contributors, through OpenFreeMap",
  },
  {
    name: "MET Norway",
    href: "https://www.met.no/en",
    what: "the weather for your runs",
  },
  {
    name: "Open Food Facts",
    href: "https://world.openfoodfacts.org",
    what: "the food database and barcodes",
  },
  {
    name: "Unsplash+",
    href: "https://unsplash.com/plus",
    what: "the photographs on this website’s home page",
  },
];

/** The About page: what Tropos is for, what it holds to, who runs it. */
export default function AboutPage() {
  return (
    <SiteLayout current="/about">
      <section className="mx-auto max-w-[70rem] px-4 pb-6 pt-10 lg:px-8 lg:pt-16">
        <p className={`text-[0.9375rem] font-semibold ${KICKER_CLASS.brand}`}>
          About
        </p>
        <h1 className="mt-3 max-w-3xl text-h1 font-extrabold leading-[1.08] tracking-tight text-foreground text-balance lg:text-[3.5rem]">
          One plan for lifting, running and food
        </h1>
        <div className="site-prose mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">
          <p>
            Tropos plans a week of lifting and running and sets a daily calorie
            target that fits it. It’s for people who do both, or want to, and
            would rather follow one plan than keep three apps in step.
          </p>
          <p>
            It’s an iPhone app, run by Myles Kennedy, trading as Tropos. For
            anything at all, write to{" "}
            <a
              href="mailto:support@troposfit.com"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              support@troposfit.com
            </a>
            .
          </p>
        </div>
      </section>

      <section
        aria-labelledby="holds"
        className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
      >
        <h2
          id="holds"
          className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.5rem]"
        >
          What Tropos holds to
        </h2>
        <ul className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
          {HOLDS.map((hold) => (
            <li
              key={hold.heading}
              className="rounded-2xl bg-card p-4 card-shadow lg:p-6"
            >
              <h3 className="text-lg font-bold text-foreground">
                {hold.heading}
              </h3>
              <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                {hold.line}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="credits"
        className="mx-auto max-w-[70rem] px-4 pb-14 lg:px-8 lg:pb-20"
      >
        <h2
          id="credits"
          className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.25rem]"
        >
          With thanks to
        </h2>
        <ul className="mt-6 max-w-2xl divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {CREDITS.map((credit) => (
            <li key={credit.name} className="py-4 text-base">
              <a
                href={credit.href}
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {credit.name}
              </a>
              <span className="text-muted-foreground">
                , for {credit.what}.
              </span>
            </li>
          ))}
        </ul>
      </section>

      <GetTheApp
        heading="Get your first week planned"
        line="Tropos is free on the App Store, with Pro when you want it."
      />
    </SiteLayout>
  );
}
