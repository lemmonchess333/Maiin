import AppScreen from "@/website/blocks/AppScreen";
import ArtHero from "@/website/blocks/ArtHero";
import Feature from "@/website/blocks/Feature";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import liftBest from "@/website/screens/lift-best.webp";
import liftDay from "@/website/screens/lift-day.webp";
import { sitePage } from "@/website/sitePages";
import { sitePageHead, usePageHead } from "@/website/usePageHead";

/** A few of the drawn form guides, from public/form-art/. */
const GUIDES = [
  { file: "squat", name: "Squat" },
  { file: "bench-press", name: "Bench press" },
  { file: "deadlift", name: "Deadlift" },
  { file: "pull-ups", name: "Pull-up" },
  { file: "romanian-deadlift", name: "Romanian deadlift" },
  { file: "lateral-raise", name: "Lateral raise" },
] as const;

/**
 * troposfit.com/lifting: the lifting plan, a session, the time and
 * joint options, the drawn guides and the record of it all. Every claim
 * is one the App Store listing makes (docs/app-store/listing.md).
 */
export default function Lifting() {
  usePageHead(sitePageHead(sitePage("lifting")));
  return (
    <SiteLayout>
      <ArtHero
        kicker="Lifting"
        kickerClass="text-lifting-strong"
        title="Strength sessions built around your week"
        lede="2 to 6 sessions a week, split to suit your days: full body, upper and lower, or push, pull and legs. Starting weights come from your bodyweight and experience, in kg or lb."
        art="/form-art/overhead-press.webp"
        light="lifting"
      />

      <Feature
        title="Every session starts from your last"
        points={[
          "Warm-up sets, a rest timer and a plate calculator",
          "New personal bests marked as you lift",
          "A deload week suggested when your training calls for one",
        ]}
        picture={
          <AppScreen
            src={liftDay}
            alt="A lift day in Tropos: barbell squat, 3 sets of 6 to 10 reps at 80 kg, Romanian deadlift at 70 kg, then hack squat and standing calf raise as a superset, each with its drawing."
            width={706}
            height={622}
          />
        }
      >
        <p>
          Each exercise opens on the weight and reps you did last time. Hit your
          targets and the plan adds weight or reps next time.
        </p>
      </Feature>

      <Feature
        flip
        title="Short on time, or working around a sore joint"
        points={[
          "45 or 30 minute versions that keep the main lifts",
          "An easier day without changing the plan",
          "Choices that work around your lower back, shoulders, knees, elbows or wrists",
        ]}
        picture={
          <ul
            className="grid grid-cols-3 gap-3"
            aria-label="Six of the drawn form guides"
          >
            {GUIDES.map((guide) => (
              <li
                key={guide.file}
                className="rounded-xl bg-card card-shadow p-3 text-center"
              >
                <img
                  src={`/form-art/${guide.file}.webp`}
                  alt=""
                  width={160}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  className="mx-auto aspect-square w-full object-contain"
                />
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {guide.name}
                </p>
              </li>
            ))}
          </ul>
        }
      >
        <p>
          Over 150 exercises, each with a drawn form guide that lights the
          muscles it works. Tell Tropos your equipment and any limitation, and
          it picks exercises to suit.
        </p>
      </Feature>

      <Feature
        title="See it add up"
        points={[
          "Personal records by exercise",
          "A map of the muscles you’ve trained",
          "A review of each week",
        ]}
        picture={
          <AppScreen
            src={liftBest}
            alt="A finished lift in Tropos: Pull A done, 2,295 kg lifted in 41 minutes, and a new best on the barbell row, 35 kg for 8."
            width={660}
            height={1431}
          />
        }
      >
        <p>
          A weekly score from 0 to 100 says how your training went, and
          Analytics lays out your lifting, running, body and food.
        </p>
      </Feature>

      <GetTheApp next={{ to: "/running", label: "Next: running" }} />
    </SiteLayout>
  );
}
