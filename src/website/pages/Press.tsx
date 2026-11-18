import { Download } from "lucide-react";
import { getInlinePriceSummary, PRO_PLANS } from "@/lib/proPlans";
import { THEME } from "@/lib/theme";
import GetTheApp from "@/website/site/GetTheApp";
import { KICKER_CLASS } from "@/website/site/domains";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

/** Tropos in a paragraph, for anyone writing about it. */
const PRESS_PARAGRAPH = `Tropos is an iPhone app that plans a week of lifting and running and sets a daily calorie target to fit it. Setup asks a few questions and ends on a plan: lift sessions on the days you have, runs fitted around them, and race plans from 5K to 100K. Sets arrive filled in from last time, runs are tracked by GPS, and food is logged by typing, searching or scanning a barcode. Tropos is free, and Tropos Pro is ${getInlinePriceSummary(PRO_PLANS)}.`;

const FACTS: readonly { term: string; detail: string }[] = [
  { term: "Platform", detail: "iPhone, iOS 15.4 or later" },
  {
    term: "Price",
    detail: `Free. Tropos Pro is ${getInlinePriceSummary(PRO_PLANS)} in the UK.`,
  },
  { term: "Category", detail: "Health & Fitness" },
  { term: "Run by", detail: "Myles Kennedy, trading as Tropos" },
  {
    term: "Contact",
    detail: "support@troposfit.com, with “Press” in the subject",
  },
];

/** The kit's files (src/website/static/press, served under /press-kit/). */
const LOGOS: readonly { href: string; label: string; detail: string }[] = [
  {
    href: "/press-kit/tropos-app-icon-1024.png",
    label: "App icon",
    detail: "PNG, 1024 px",
  },
  {
    href: "/press-kit/tropos-mark-purple.svg",
    label: "The mark, purple",
    detail: "SVG",
  },
  {
    href: "/press-kit/tropos-mark-white.svg",
    label: "The mark, white",
    detail: "SVG, for a dark ground",
  },
];

const PRESS_SCREENS: readonly {
  file: string;
  screen: keyof typeof SCREENS;
  label: string;
}[] = [
  { file: "home", screen: "home", label: "Home" },
  { file: "workout", screen: "workout", label: "A workout" },
  { file: "run", screen: "run", label: "A run" },
  { file: "food", screen: "food", label: "Food" },
  { file: "race-plan", screen: "racePlan", label: "A race plan" },
  { file: "feed", screen: "feed", label: "The feed" },
];

/** The brand's colours, read from the app's own constants. */
const COLOURS: readonly { name: string; hex: string; use: string }[] = [
  { name: "Purple", hex: THEME.lifting, use: "Lifting and the brand" },
  { name: "Coral", hex: THEME.running, use: "Running" },
  { name: "Orange", hex: THEME.semantic.nutrition, use: "Food" },
  { name: "Teal", hex: THEME.teal, use: "Water" },
  { name: "Night", hex: THEME.bg, use: "The dark page" },
];

const SECTION_HEADING =
  "text-[1.5rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2rem]";

/** The press kit: the paragraph, the facts, the files and the colours. */
export default function PressPage() {
  return (
    <SiteLayout current="/press">
      <section className="mx-auto max-w-[70rem] px-4 pb-4 pt-10 lg:px-8 lg:pt-16">
        <p className={`text-[0.9375rem] font-semibold ${KICKER_CLASS.brand}`}>
          Press
        </p>
        <h1 className="mt-3 text-h1 font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-[3.5rem]">
          Press kit
        </h1>
        <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">
          What you need to write about Tropos. For anything else, email{" "}
          <a
            href="mailto:support@troposfit.com?subject=Press"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            support@troposfit.com
          </a>{" "}
          with “Press” in the subject.
        </p>
      </section>

      <section
        aria-labelledby="paragraph"
        className="mx-auto max-w-[70rem] px-4 py-10 lg:px-8"
      >
        <h2 id="paragraph" className={SECTION_HEADING}>
          Tropos in a paragraph
        </h2>
        <p className="mt-4 max-w-3xl rounded-2xl bg-card p-4 text-[1.0625rem] lg:p-6 leading-relaxed text-foreground card-shadow">
          {PRESS_PARAGRAPH}
        </p>
      </section>

      <section
        aria-labelledby="facts"
        className="mx-auto max-w-[70rem] px-4 py-10 lg:px-8"
      >
        <h2 id="facts" className={SECTION_HEADING}>
          The facts
        </h2>
        <dl className="mt-4 max-w-3xl divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {FACTS.map((fact) => (
            <div
              key={fact.term}
              className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]"
            >
              <dt className="text-sm font-semibold text-muted-foreground">
                {fact.term}
              </dt>
              <dd className="text-base text-foreground">{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="logos"
        className="mx-auto max-w-[70rem] px-4 py-10 lg:px-8"
      >
        <h2 id="logos" className={SECTION_HEADING}>
          The icon and the mark
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {LOGOS.map((logo) => (
            <li
              key={logo.href}
              className="rounded-2xl bg-card p-4 card-shadow lg:p-5"
            >
              <div className="flex h-28 items-center justify-center">
                <img
                  src={logo.href}
                  alt=""
                  loading="lazy"
                  className="h-20 w-auto rounded-[22%]"
                />
              </div>
              <a
                href={logo.href}
                download
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                <Download className="size-4" aria-hidden="true" />
                {logo.label}
              </a>
              <p className="text-xs text-muted-foreground">{logo.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          Use the icon and the mark as they are, without changing their colours
          or their shape.
        </p>
      </section>

      <section
        aria-labelledby="screens"
        className="mx-auto max-w-[70rem] px-4 py-10 lg:px-8"
      >
        <h2 id="screens" className={SECTION_HEADING}>
          Screens of the app
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Captured from the app on demo accounts, at 1320 by 2868 pixels. The
          people and figures in them are made up.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {PRESS_SCREENS.map((item) => (
            <li key={item.file}>
              <a
                href={`/press-kit/screens/tropos-${item.file}.webp`}
                download
                className="group block rounded-[9%/4.15%] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
              >
                <img
                  src={SCREENS[item.screen].src}
                  alt=""
                  width={SCREENS[item.screen].width}
                  height={SCREENS[item.screen].height}
                  loading="lazy"
                  decoding="async"
                  className="site-screen"
                />
                <span className="mt-2 flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Download className="size-4" aria-hidden="true" />
                  {item.label}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="colours"
        className="mx-auto max-w-[70rem] px-4 py-10 lg:px-8"
      >
        <h2 id="colours" className={SECTION_HEADING}>
          Colours and type
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {COLOURS.map((colour) => (
            <li key={colour.hex}>
              <div
                aria-hidden="true"
                className="h-16 rounded-xl ring-1 ring-white/10"
                style={{ backgroundColor: colour.hex }}
              />
              <p className="mt-2 text-sm font-semibold text-foreground">
                {colour.name}
              </p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {colour.hex}
              </p>
              <p className="text-xs text-muted-foreground">{colour.use}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground">
          The words are set in Plus Jakarta Sans, and the figures and the name
          in Archivo. The photographs on this website are licensed to Tropos and
          aren’t part of the kit.
        </p>
      </section>

      <GetTheApp
        heading="Try the app"
        line="Tropos is free on the App Store."
      />
    </SiteLayout>
  );
}
