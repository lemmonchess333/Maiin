import AppScreen from "@/website/blocks/AppScreen";
import ArtHero from "@/website/blocks/ArtHero";
import Feature from "@/website/blocks/Feature";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import trainRun from "@/website/screens/train-run.webp";
import { sitePage } from "@/website/sitePages";
import { usePageHead } from "@/website/usePageHead";

/** The goals a run plan is built for (the listing's race plans). */
const GOALS = ["5K", "10K", "Half marathon", "Marathon"] as const;

/**
 * troposfit.com/running: the race plan, the run itself and sharing it
 * safely. The plans for a half marathon or longer are Pro after their
 * first week (Q85, Run27 (18), `FREE_KEEPS`), and the page says so.
 */
export default function Running() {
  usePageHead(sitePage("running"));
  return (
    <SiteLayout>
      <ArtHero
        kicker="Running"
        kickerClass="text-running-strong"
        title="From your first 5K to a marathon"
        lede="Race plans built back from race day through base, build and taper, around the days you lift. Or runs with no race at all."
        art="/form-art/run-fast.webp"
        light="running"
      />

      <Feature
        title="Your next run, already planned"
        checkClass="text-running-strong"
        points={[
          "Easy runs, tempo runs, intervals and long runs",
          "Adjust a week when you’re unwell or busy, and keep the race date",
          "Training paces from a recent race time, and race predictions",
        ]}
        picture={
          <AppScreen
            src={trainRun}
            alt="Tropos’s Train tab during marathon prep: up next on Saturday, Easy 30, 30 minutes at 6:36 to 7:25 per kilometre, and the race plan for the London Marathon."
            width={392}
            height={780}
          />
        }
      >
        <p>
          Choose a race from the directory or enter your own date, and the plan
          works back from race day. Each run says what it’s for and the pace to
          hold.
        </p>
        <ul className="flex flex-wrap gap-2 pt-1" aria-label="Race plans">
          {GOALS.map((goal) => (
            <li
              key={goal}
              className="rounded-full bg-running/10 chip-edge px-3 py-1.5 text-sm font-semibold text-running-strong"
            >
              {goal}
            </li>
          ))}
        </ul>
        <p className="text-base">
          5K and 10K plans are free. Plans for a half marathon or longer are
          part of Pro after their first week.
        </p>
      </Feature>

      <Feature
        flip
        title="Every run, measured"
        checkClass="text-running-strong"
        points={[
          "Spoken splits and pace alerts while you run",
          "Plan a route and run it again against your last time",
          "Mileage on each pair of shoes",
        ]}
        picture={
          <div
            className="art-hero-picture"
            style={{
              ["--art-light" as string]: "var(--running)",
              maxWidth: "20rem",
            }}
          >
            <img
              src="/form-art/run-easy.webp"
              alt=""
              width={232}
              height={480}
              loading="lazy"
              decoding="async"
            />
          </div>
        }
      >
        <p>
          GPS runs with pace, splits, elevation and a route map coloured by
          pace.
        </p>
      </Feature>

      <Feature
        title="Share the run, keep your front door private"
        checkClass="text-running-strong"
        points={[
          "Hide the start and end of the runs you share",
          "Privacy zones around the places you choose",
          "Segments timed against the people you follow",
        ]}
      >
        <p>
          Share a run with the people who follow you, or keep it to yourself.
          Each run’s map shows only what you choose.
        </p>
      </Feature>

      <GetTheApp next={{ to: "/food", label: "Next: food" }} />
    </SiteLayout>
  );
}
