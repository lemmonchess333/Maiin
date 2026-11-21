import { ArrowRight } from "lucide-react";
import { DAILY_AI_LIMITS } from "@/lib/aiLimits";
import AppScreen from "@/website/site/AppScreen";
import { FOOD_ART } from "@/website/site/art";
import FeatureCards from "@/website/site/FeatureCards";
import FeatureSection from "@/website/site/FeatureSection";
import GetTheApp from "@/website/site/GetTheApp";
import PageHero from "@/website/site/PageHero";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

/** Four of the app's own food drawings (public/food-art). */
const FOOD_ROW = [
  FOOD_ART.eggs,
  FOOD_ART.bowl,
  FOOD_ART.salad,
  FOOD_ART.fruit,
] as const;

/**
 * The Food page: logging, the target, weight and water, and what Pro
 * adds. The photo line says what Food9 holds (CLAUDE.md, "Meal photos are
 * device-local"): Google reads the photo, and the phone is the only place
 * it is kept.
 */
export default function FoodPage() {
  return (
    <SiteLayout current="/food">
      <PageHero
        domain="food"
        kicker="Food"
        heading="Log food the way you’d say it"
        line="Type a meal, search the food database or scan a barcode, against a daily calorie target worked out from your numbers."
        picture={<AppScreen screen={SCREENS.food} eager />}
      />

      <FeatureSection heading="Type it, search it or scan it">
        <p>
          Type “2 eggs on toast” and Tropos reads it as foods with their
          calories. Search the food database, or scan a barcode, free.
        </p>
        <p>
          With nothing typed, Food lists what you’ve logged before, and one tap
          logs it again.
        </p>
        <ul aria-hidden="true" className="mt-6 flex items-end gap-4">
          {FOOD_ROW.map((src) => (
            <li key={src} className="site-light site-light-food">
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-14 w-auto lg:h-16"
              />
            </li>
          ))}
        </ul>
      </FeatureSection>

      <FeatureCards
        id="target"
        heading="A target, and a trend"
        cards={[
          {
            heading: "A target from your numbers",
            body: "Your daily calorie target comes from your weight, height, age and activity, set for your goal, and splits into protein, carbs and fat.",
          },
          {
            heading: "Weight without the swings",
            body: "Log your weight and water from Home. Progress draws your weight’s trend, so one heavy morning doesn’t read as a change.",
          },
        ]}
      />

      <section
        aria-labelledby="with-pro"
        className="mx-auto max-w-[70rem] px-4 pb-14 lg:px-8 lg:pb-20"
      >
        <div className="rounded-2xl bg-card p-4 card-shadow lg:p-10">
          <p className="text-[0.9375rem] font-semibold text-lifting-strong">
            Pro
          </p>
          <h2
            id="with-pro"
            className="mt-2 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.25rem]"
          >
            Log a meal from a photo
          </h2>
          <div className="site-prose mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            <p>
              Take a photo and the foods and their macros are filled in for you
              to check, up to {DAILY_AI_LIMITS.pro.image_ai} a day. Tropos asks
              before it sends the first one. Photos are read by Google and kept
              only on your phone.
            </p>
            <p>
              Pro also adapts your calorie target to what you log and how your
              weight moves, and shifts protein, carbs and fat with each day’s
              training.
            </p>
          </div>
          <a
            href="/pro"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline"
          >
            What Pro adds
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <GetTheApp
        heading="Get your daily target"
        line="Setup works out your calorie target from your numbers and your goal."
      />
    </SiteLayout>
  );
}
