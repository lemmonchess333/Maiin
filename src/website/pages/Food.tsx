import { Camera } from "lucide-react";
import { PRO_INCLUDES } from "@/components/paywall/proIncludesCopy";
import AppScreen from "@/website/blocks/AppScreen";
import ArtHero from "@/website/blocks/ArtHero";
import Feature from "@/website/blocks/Feature";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import foodDay from "@/website/screens/food-day.webp";
import { sitePage } from "@/website/sitePages";
import { usePageHead } from "@/website/usePageHead";

/** The food drawings the diary uses, from public/food-art/ (192 px, so
 *  shown at 96 px or less). */
const FOODS = [
  "bowl",
  "eggs",
  "salad",
  "protein",
  "fruit",
  "bread",
  "plate",
  "drink",
  "grains",
] as const;

/**
 * troposfit.com/food: the target, logging, Pro's photo logging and what
 * happens to the photo (Food9: analysed by Google, kept only on the
 * phone, and only once the person has said yes), water and weight.
 */
export default function Food() {
  usePageHead(sitePage("food"));
  return (
    <SiteLayout>
      <ArtHero
        kicker="Food"
        kickerClass="text-nutrition-strong"
        title="Eat for the plan you’re on"
        lede="Tropos works out a daily calorie target from your weight, height, age and goal, with protein, carbs and fat."
        light="nutrition"
        picture={
          <AppScreen
            src={foodDay}
            alt="Tropos’s Food page: 410 kcal left of 2,200, protein, carbs and fat left, and the day’s food log."
            width={786}
            height={1520}
            priority
          />
        }
      />

      <Feature
        title="Log it the way you’d say it"
        checkClass="text-nutrition-strong"
        points={[
          "Search the food database",
          "Scan a barcode",
          "Your usual breakfast in one tap",
        ]}
        picture={
          <ul
            className="grid grid-cols-3 gap-3 max-w-[20rem] mx-auto"
            aria-hidden="true"
          >
            {FOODS.map((food) => (
              <li
                key={food}
                className="grid place-items-center aspect-square rounded-2xl bg-card card-shadow"
              >
                <img
                  src={`/food-art/${food}.webp`}
                  alt=""
                  width={80}
                  height={80}
                  loading="lazy"
                  decoding="async"
                />
              </li>
            ))}
          </ul>
        }
      >
        <p>Type “two eggs and toast” and Tropos finds the foods.</p>
      </Feature>

      <Feature
        flip
        title="A photo of the meal, with Pro"
        checkClass="text-nutrition-strong"
        points={[
          PRO_INCLUDES[0],
          "Typed meals read by AI, which knows more than the built-in list",
        ]}
        picture={
          <div className="rounded-[24px] bg-card card-shadow p-6 space-y-4">
            <Camera
              className="size-7 text-nutrition-strong"
              aria-hidden="true"
            />
            <p className="text-base font-semibold">Where the photo goes</p>
            <p className="text-base text-muted-foreground">
              Tropos asks before it sends your first photo. Google’s Gemini
              reads it, and the photo is kept only on your phone.
            </p>
          </div>
        }
      >
        <p>
          Take a photo of what you’re eating and the foods and their macros are
          filled in for you to check.
        </p>
      </Feature>

      <Feature
        title="Water and weight, without the noise"
        checkClass="text-nutrition-strong"
        points={[
          "A glass of water logged from Home",
          "Your weight trend, not the day-to-day swings",
        ]}
      >
        <p>
          Weigh in when you like. Home shows your water for the day and your
          weight trend beside it.
        </p>
      </Feature>

      <GetTheApp next={{ to: "/social", label: "Next: social" }} />
    </SiteLayout>
  );
}
