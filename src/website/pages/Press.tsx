import { Download } from "lucide-react";
import appIconSvg from "@/assets/brand/app-icon.svg";
import { PRO_PLANS, TRIAL_DAYS, getInlinePriceSummary } from "@/lib/proPlans";
import { THEME } from "@/lib/theme";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import appIconPng from "@/website/press/tropos-app-icon-1024.png";
import lockupInk from "@/website/press/tropos-lockup-ink.png";
import lockupWhite from "@/website/press/tropos-lockup-white.png";
import markSvg from "@/website/press/tropos-mark.svg";
import challengeBoard from "@/website/screens/challenge-board.webp";
import foodDay from "@/website/screens/food-day.webp";
import homeToday from "@/website/screens/home-today.webp";
import liftDay from "@/website/screens/lift-day.webp";
import trainRun from "@/website/screens/train-run.webp";
import { sitePage } from "@/website/sitePages";
import { sitePageHead, usePageHead } from "@/website/usePageHead";

/** The paragraph to quote, short and long, in the App Store listing's
 *  words (docs/app-store/listing.md). */
const SHORT =
  "Tropos is an iPhone app that plans lifting, running and food together. It builds a weekly plan of lift sessions and runs around the days you can train, and works out a daily calorie target from your numbers.";
const LONG = [
  "Tell Tropos your goal, the days you can train, your equipment and your experience. It plans lift sessions for those days, fits your runs around them, and suggests the next step from what you log: each lift starts from what you did last time, and race plans for 5K to marathon are built back from race day through base, build and taper.",
  "Food is logged by typing a meal, searching or scanning a barcode, against a daily calorie target with protein, carbs and fat. People share sessions with their followers, train together in Circles of up to 8, and join challenges, Spaces for races and a weekly league scored against their own plan. Tropos Pro adds photo food logging, a calorie target that adapts to what you log and weigh, and paces that move with your runs.",
];

const FACTS: readonly [string, string][] = [
  ["Name", "Tropos"],
  ["What it is", "A lifting, running and food planner"],
  ["Platform", "iPhone, iOS 15.4 or later"],
  ["Category", "Health & Fitness"],
  [
    "Price",
    `Free to download. Tropos Pro is ${getInlinePriceSummary(PRO_PLANS)} in the UK, with a ${TRIAL_DAYS}-day free trial for new subscribers.`,
  ],
  ["Website", "troposfit.com"],
  ["Press contact", "support@troposfit.com, with “Press” in the subject"],
];

const FILES = [
  {
    href: lockupWhite,
    name: "tropos-lockup-white.png",
    label: "Lockup, white, for dark backgrounds",
    preview: "dark",
  },
  {
    href: lockupInk,
    name: "tropos-lockup-ink.png",
    label: "Lockup, ink, for light backgrounds",
    preview: "light",
  },
  {
    href: markSvg,
    name: "tropos-mark.svg",
    label: "The mark, brand purple (SVG)",
    preview: "dark",
  },
  {
    href: appIconSvg,
    name: "tropos-app-icon.svg",
    label: "App icon (SVG)",
    preview: "dark",
  },
  {
    href: appIconPng,
    name: "tropos-app-icon-1024.png",
    label: "App icon, 1024 px (PNG)",
    preview: "dark",
  },
] as const;

const SCREENS = [
  {
    href: homeToday,
    name: "tropos-home.webp",
    label: "Home: today’s session and the week",
  },
  {
    href: liftDay,
    name: "tropos-lift-day.webp",
    label: "A lift day’s exercises",
  },
  {
    href: trainRun,
    name: "tropos-next-run.webp",
    label: "The next run and the race plan",
  },
  {
    href: foodDay,
    name: "tropos-food.webp",
    label: "Food: the day’s target and log",
  },
  {
    href: challengeBoard,
    name: "tropos-challenge.webp",
    label: "A weekly challenge’s board",
  },
] as const;

const COLOURS = [
  {
    name: "Purple",
    use: "Lifting and the brand",
    hex: THEME.lifting,
    swatch: "bg-lifting",
  },
  { name: "Coral", use: "Running", hex: THEME.running, swatch: "bg-running" },
  {
    name: "Orange",
    use: "Food",
    hex: THEME.semantic.nutrition,
    swatch: "bg-nutrition",
  },
] as const;

/**
 * troposfit.com/press: MacroFactor's press kit's shape (research.md): the
 * facts, the paragraph to quote, the logo files one by one, the app's
 * screens, the colours and who to ask. The welcome's photographs are not
 * offered: their Unsplash+ licence is Tropos’s, not a publication's.
 */
export default function Press() {
  usePageHead(sitePageHead(sitePage("press")));
  return (
    <SiteLayout>
      <section className="site-container pt-6 pb-10 md:pt-12">
        <p className="site-kicker text-lifting-strong">Press kit</p>
        <h1 className="site-h1 mt-2 max-w-[40rem]">Writing about Tropos</h1>
        <p className="site-lede mt-4 text-muted-foreground max-w-[40rem]">
          The facts, a paragraph to quote, the logo and the app’s screens. Use
          them as they are; ask if you need something else.
        </p>
      </section>

      <section className="site-section" aria-labelledby="press-facts">
        <div className="site-container grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="press-facts" className="site-h2">
              The facts
            </h2>
            <dl className="mt-6 divide-y divide-border/70 border-y border-border/70">
              {FACTS.map(([term, value]) => (
                <div
                  key={term}
                  className="grid grid-cols-[8.5rem_1fr] gap-4 py-3"
                >
                  <dt className="text-sm font-semibold text-muted-foreground">
                    {term}
                  </dt>
                  <dd className="text-base">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="site-h2">About Tropos</h2>
            <p className="mt-6 text-sm font-semibold text-muted-foreground">
              Short
            </p>
            <p className="mt-1 text-base">{SHORT}</p>
            <p className="mt-6 text-sm font-semibold text-muted-foreground">
              Long
            </p>
            {LONG.map((para) => (
              <p key={para.slice(0, 24)} className="mt-1 mb-3 text-base">
                {para}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" aria-labelledby="press-logo">
        <div className="site-container">
          <h2 id="press-logo" className="site-h2">
            The logo and the icon
          </h2>
          <p className="site-lede mt-3 text-muted-foreground max-w-[40rem]">
            The lockup is the mark beside the name. Keep the mark in brand
            purple, and don’t stretch, recolour or redraw either.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FILES.map((file) => (
              <li
                key={file.name}
                className="rounded-[24px] bg-card card-shadow overflow-hidden"
              >
                <div
                  className={
                    file.preview === "light"
                      ? "grid place-items-center h-36 bg-stage-foreground"
                      : "grid place-items-center h-36 bg-stage"
                  }
                >
                  <img
                    src={file.href}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="max-h-20 max-w-[70%] object-contain"
                  />
                </div>
                <a
                  href={file.href}
                  download={file.name}
                  className="flex items-center justify-between gap-3 min-h-[56px] px-5 text-sm font-semibold hover:bg-white/5"
                >
                  {file.label}
                  <Download className="size-4 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <ul className="mt-8 flex flex-wrap gap-6" aria-label="Brand colours">
            {COLOURS.map((colour) => (
              <li key={colour.name} className="flex items-center gap-3">
                <span
                  className={`size-10 rounded-xl ${colour.swatch}`}
                  aria-hidden="true"
                />
                <span className="text-sm">
                  <span className="font-semibold">{colour.name}</span>{" "}
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {colour.hex}
                  </span>
                  <br />
                  <span className="text-muted-foreground">{colour.use}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" aria-labelledby="press-screens">
        <div className="site-container">
          <h2 id="press-screens" className="site-h2">
            App screens
          </h2>
          <p className="site-lede mt-3 text-muted-foreground max-w-[40rem]">
            Captured from the app on a demo account: the names and numbers on
            them are made up.
          </p>
          <ul className="mt-8 grid items-start gap-4 grid-cols-2 lg:grid-cols-5">
            {SCREENS.map((screen) => (
              <li key={screen.name}>
                <a
                  href={screen.href}
                  download={screen.name}
                  className="group block rounded-[24px] bg-card card-shadow p-3 hover:bg-white/[0.03]"
                >
                  <img
                    src={screen.href}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto rounded-2xl"
                  />
                  <span className="mt-3 flex items-start justify-between gap-2 text-sm font-semibold">
                    {screen.label}
                    <Download
                      className="size-4 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <GetTheApp badge />
    </SiteLayout>
  );
}
