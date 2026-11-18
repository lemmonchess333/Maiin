import AppScreen from "@/website/site/AppScreen";
import { FORM_ART } from "@/website/site/art";
import FactRow from "@/website/site/FactRow";
import FeatureCards from "@/website/site/FeatureCards";
import FeatureSection from "@/website/site/FeatureSection";
import GetTheApp from "@/website/site/GetTheApp";
import PageHero from "@/website/site/PageHero";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

/** Eight of the drawn form guides (public/form-art), named as the app
 *  names them. */
const DRAWINGS: readonly { src: string; name: string }[] = [
  { src: FORM_ART.squat, name: "Barbell squat" },
  { src: FORM_ART.benchPress, name: "Bench press" },
  { src: FORM_ART.deadlift, name: "Deadlift" },
  { src: FORM_ART.overheadPress, name: "Overhead press" },
  { src: FORM_ART.pullUps, name: "Pull-ups" },
  { src: FORM_ART.barbellRow, name: "Barbell row" },
  { src: FORM_ART.romanianDeadlift, name: "Romanian deadlift" },
  { src: FORM_ART.hipThrust, name: "Hip thrust" },
];

/** The Lifting page: the plan, the sets, the drawings, and new bests. */
export default function LiftingPage() {
  return (
    <SiteLayout current="/lifting">
      <PageHero
        domain="lifting"
        kicker="Lifting"
        heading="A lifting plan for the days you have"
        line="2 to 6 sessions a week, split to suit your days. Each session starts from what you lifted last time."
        picture={<AppScreen screen={SCREENS.home} eager />}
      />

      <FactRow
        label="Lifting in numbers"
        facts={[
          { figure: "2 to 6", label: "sessions a week" },
          { figure: "Over 150", label: "exercises, each with a drawn guide" },
          { figure: "45 or 30", label: "minute versions when time is short" },
          { figure: "5", label: "sore spots the plan works around" },
        ]}
      />

      <FeatureSection
        heading="Split to suit your week"
        picture={<AppScreen screen={SCREENS.train} />}
      >
        <p>
          The split follows the days you lift: full body on 2 or 3, upper and
          lower on 4, push, pull and legs on 5 or 6. Starting weights come from
          your bodyweight and experience, in kilos or pounds.
        </p>
        <p>
          Lifts go in order, so a missed day moves the next one along rather
          than skipping it.
        </p>
      </FeatureSection>

      <FeatureSection
        heading="Every set arrives filled in"
        flip
        picture={<AppScreen screen={SCREENS.workout} />}
      >
        <p>
          Weights and reps come from your last session. Hit your reps and the
          plan adds weight or reps next time. One tap on a set logs it.
        </p>
        <p>
          Warm-up sets, a rest timer and, for barbell lifts, a plate calculator
          are on the same screen.
        </p>
      </FeatureSection>

      <section
        aria-labelledby="drawings"
        className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
      >
        <h2
          id="drawings"
          className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.5rem]"
        >
          A drawing for every exercise
        </h2>
        <p className="mt-3 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          Over 150 exercises, each with a drawn guide to the movement and the
          muscles it works.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          {DRAWINGS.map((drawing) => (
            <li
              key={drawing.src}
              className="flex flex-col items-center rounded-2xl bg-card px-3 pb-4 pt-5 card-shadow"
            >
              <img
                src={drawing.src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-24 w-auto object-contain lg:h-32"
              />
              <p className="mt-3 text-center text-sm font-semibold text-foreground">
                {drawing.name}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <FeatureCards
        id="short-days"
        heading="On a short day or a sore one"
        cards={[
          {
            heading: "Short on time?",
            body: "Take a 45 or 30 minute version that keeps the main lifts. Your programme doesn’t change.",
          },
          {
            heading: "Easier today",
            body: "One set less per lift, at lighter weights, when the day calls for it.",
          },
          {
            heading: "A lighter week",
            body: "Offered when your training has run high: half the sets, at the same weights.",
          },
          {
            heading: "Around a sore spot",
            body: "Tell Tropos about your lower back, shoulder, knee, elbow or wrist, and it chooses exercises that work around it.",
          },
        ]}
      />

      <FeatureSection
        heading="New bests, marked as you lift"
        flip
        picture={<AppScreen screen={SCREENS.liftBest} />}
      >
        <p>
          A new best is marked on the set as you lift it, and the finish shows
          what you lifted and how it compares with your best before.
        </p>
      </FeatureSection>

      <GetTheApp
        heading="Get a lifting plan for your week"
        line="Setup takes a few minutes and ends on your plan."
      />
    </SiteLayout>
  );
}
