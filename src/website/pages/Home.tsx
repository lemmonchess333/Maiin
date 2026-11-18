import { useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CircleCheck } from "lucide-react";
import { PRO_INCLUDES } from "@/components/paywall/proIncludesCopy";
import AppStoreBadge from "@/website/AppStoreBadge";
import WebsiteInvite from "@/website/WebsiteInvite";
import AppScreen from "@/website/blocks/AppScreen";
import Feature from "@/website/blocks/Feature";
import HeroPhotos from "@/website/blocks/HeroPhotos";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import homeToday from "@/website/screens/home-today.webp";
import challengeBoard from "@/website/screens/challenge-board.webp";
import { sitePage } from "@/website/sitePages";
import { usePageHead } from "@/website/usePageHead";
import { landingContext, type LandingContext } from "@/website/websiteAddress";

const SPORTS = [
  {
    to: "/lifting",
    kicker: "Lifting",
    kickerClass: "text-lifting-strong",
    light: "lifting",
    art: ["/form-art/overhead-press.webp"],
    line: "2 to 6 sessions a week. Each one starts from what you lifted last time.",
    link: "See lifting",
  },
  {
    to: "/running",
    kicker: "Running",
    kickerClass: "text-running-strong",
    light: "running",
    art: ["/form-art/run-fast.webp"],
    line: "GPS runs, and race plans from 5K to marathon around your lifting.",
    link: "See running",
  },
  {
    to: "/food",
    kicker: "Food",
    kickerClass: "text-nutrition-strong",
    light: "nutrition",
    art: ["/food-art/eggs.webp", "/food-art/bowl.webp", "/food-art/salad.webp"],
    line: "A daily calorie target from your numbers. Log by typing or barcode.",
    link: "See food",
  },
] as const;

const NO_CONTEXT: LandingContext = { invite: null, note: null };
const subscribeToNothing = () => () => {};

/**
 * What the address that brought the visitor adds to Home: a friend's
 * invite, a shared Space or the checkout's return (`websiteAddress.ts`).
 * Nothing while the browser takes over the HTML it was sent (Home, written
 * out at build time, which knows no address), then the address's own:
 * `useSyncExternalStore`'s server snapshot is what hydration reads.
 */
function useLandingContext(): LandingContext {
  const { pathname, search } = useLocation();
  const inBrowser = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  return inBrowser ? landingContext(pathname, search) : NO_CONTEXT;
}

/**
 * troposfit.com's Home (docs/website/design.md): the welcome's
 * photographs and its promise with the App Store badge, then the app
 * doing what it promises, the three sports, the people and Pro. Every
 * address of the app's own also lands here (App1 Q52), with a line for
 * the one that brought the visitor.
 */
export default function Home() {
  usePageHead(sitePage("home"));
  const { invite, note } = useLandingContext();

  return (
    <SiteLayout overPhoto>
      <section className="home-hero" aria-labelledby="home-title">
        <HeroPhotos />
        <div className="site-container home-hero-copy">
          <div className="max-w-[36rem] space-y-3">
            {note === "checkoutDone" && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3 rounded-xl bg-success/10 border border-success/20 text-sm font-medium"
              >
                <CircleCheck
                  className="size-4 shrink-0 mt-0.5 text-success-strong"
                  aria-hidden="true"
                />
                <span>
                  Payment received. Pro is on for your account in the Tropos
                  app.
                </span>
              </div>
            )}
            {note === "space" && (
              <p className="text-sm font-semibold">
                Get Tropos on your iPhone to open this Space.
              </p>
            )}
            <p className="site-kicker text-stage-muted">For iPhone</p>
            <h1 id="home-title" className="site-h1">
              Your training and food, planned together
            </h1>
            <p className="site-lede text-stage-foreground/85">
              Tell Tropos your goal and the days you can train. It plans your
              lifting and running week and works out a daily calorie target to
              match.
            </p>
            {invite && <WebsiteInvite code={invite} />}
            <div className="flex flex-wrap items-center gap-x-5">
              <AppStoreBadge />
              <p className="text-sm text-stage-muted">
                Free to download. Pro is optional.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Feature
        title="Know what today is for"
        points={[
          "2 to 6 lift sessions a week, on the days you choose",
          "Runs planned around your lifts, from easy to long",
          "Miss a lift and it waits for your next lift day",
        ]}
        picture={
          <AppScreen
            src={homeToday}
            alt="Tropos’s Home: today is Push A, chest, shoulders and triceps, about 56 minutes, with a drawing of the bench press, Start workout, and 2 of 7 sessions done this week."
            width={786}
            height={1520}
          />
        }
      >
        <p>
          Home opens on today’s session: its name, the muscles it works, about
          how long it takes and one button to start. Under it, your week so far.
        </p>
      </Feature>

      <section className="site-section" aria-labelledby="sports-title">
        <div className="site-container">
          <h2 id="sports-title" className="site-h2 max-w-[40rem]">
            Lifting, running and food in one plan
          </h2>
          <p className="site-lede mt-4 text-muted-foreground max-w-[40rem]">
            One setup covers the three: the days you lift, the runs around them
            and a calorie target for your goal. Use one, two or all three.
          </p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {SPORTS.map((sport) => (
              <li key={sport.to}>
                <Link
                  to={sport.to}
                  className="group flex h-full flex-col rounded-[24px] bg-card card-shadow p-5 transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div
                    className="sport-card-art"
                    style={{
                      ["--art-light" as string]: `var(--${sport.light})`,
                    }}
                  >
                    <div
                      className={
                        sport.art.length > 1
                          ? "sport-card-art-trio"
                          : "contents"
                      }
                    >
                      {sport.art.map((src) => (
                        <img
                          key={src}
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ))}
                    </div>
                  </div>
                  <p className={`site-kicker mt-4 ${sport.kickerClass}`}>
                    {sport.kicker}
                  </p>
                  <p className="mt-1 text-base">{sport.line}</p>
                  <p className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                    {sport.link}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Feature
        flip
        title="Train with the people you know"
        points={[
          "Props and comments on the sessions you share",
          "Circles of up to 8, with meet-ups for a run or a lift",
          "Challenges and a weekly league, once 10 people train on Tropos",
        ]}
        picture={
          <AppScreen
            src={challengeBoard}
            alt="A weekly challenge in Tropos: Weekly Warrior, 3 days left, with its bronze medal and a board of who has trained most this week."
            width={722}
            height={886}
          />
        }
      >
        <p>
          Share a session with the people who follow you, and choose who sees
          each one.{" "}
          <Link
            to="/social"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            How Social works
          </Link>
        </p>
      </Feature>

      <section className="site-section" aria-labelledby="pro-title">
        <div className="site-container grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="site-kicker text-lifting-strong">Tropos Pro</p>
            <h2 id="pro-title" className="site-h2 mt-2">
              What Pro adds
            </h2>
            <p className="site-lede mt-4 text-muted-foreground">
              Your plan, 5K and 10K race plans, run tracking, and typed and
              barcode food logging are free.
            </p>
            <Link
              to="/pro"
              className="mt-6 inline-flex items-center gap-1.5 min-h-[44px] text-base font-semibold"
            >
              What Pro adds
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="rounded-[24px] bg-card card-shadow p-6 space-y-3">
            {PRO_INCLUDES.slice(0, 4).map((line) => (
              <li key={line} className="flex gap-3 text-base">
                <CircleCheck
                  className="size-5 shrink-0 mt-0.5 text-lifting-strong"
                  aria-hidden="true"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <GetTheApp next={{ to: "/lifting", label: "Start with lifting" }} />
    </SiteLayout>
  );
}
