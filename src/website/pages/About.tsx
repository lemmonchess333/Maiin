import pullUp from "@/assets/welcome/welcome-4-pull-up.webp";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import { sitePage } from "@/website/sitePages";
import { sitePageHead, usePageHead } from "@/website/usePageHead";
import SiteHeadline from "@/website/blocks/SiteHeadline";

/** How Tropos treats the people who use it, each true of the app on main
 *  and said in its own terms (the Privacy Policy, Food9, the league's
 *  scoring, the house voice). */
const PROMISES = [
  {
    title: "Your numbers against your own",
    body: "A week is measured against your plan and your usual week, and a league against your own plan, not against people who train twice as much.",
  },
  {
    title: "Meal photos are stored only on your phone",
    body: "A photo goes to Google’s Gemini to be read only once you’ve said yes, and Tropos keeps it on your phone, never on a server.",
  },
  {
    title: "No adverts, and your data is not sold",
    body: "Tropos shows no adverts and does not use your data for advertising. The Privacy Policy says what is collected and why.",
  },
  {
    title: "A missed day is just a day",
    body: "A lift you miss waits for your next lift day, and a planned rest day keeps your streak going.",
  },
] as const;

/**
 * troposfit.com/about: what Tropos is for, how it treats people and who
 * runs it (the operator the Terms name, section 12).
 */
export default function About() {
  usePageHead(sitePageHead(sitePage("about")));
  return (
    <SiteLayout>
      <section className="site-container grid gap-10 pt-6 pb-14 md:grid-cols-[1.3fr_1fr] md:items-center md:pt-12 lg:pb-20">
        <div>
          <p className="site-kicker text-lifting-strong">About</p>
          <SiteHeadline className="mt-2">
            One plan for lifting, running and food
          </SiteHeadline>
          <div className="site-lede mt-4 space-y-4 text-muted-foreground max-w-[36rem]">
            <p>
              A lifting app plans your lifts, a running app plans your runs and
              a food app counts your calories, and none of them knows about the
              others.
            </p>
            <p>
              Tropos is one plan for all three: your lifts on the days you
              choose, your runs fitted around them, and a calorie target for
              your goal. It is an iPhone app.
            </p>
          </div>
        </div>
        <img
          src={pullUp}
          alt="A woman holding the top of a pull-up."
          width={1080}
          height={2340}
          decoding="async"
          className="w-full max-w-[18rem] mx-auto aspect-[3/4] object-cover rounded-[28px]"
          style={{ objectPosition: "50% 30%" }}
        />
      </section>

      <section className="site-section" aria-labelledby="about-promises">
        <div className="site-container">
          <h2 id="about-promises" className="site-h2">
            How Tropos treats you
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {PROMISES.map((promise) => (
              <li
                key={promise.title}
                className="rounded-[24px] bg-card card-shadow p-6"
              >
                <h3 className="text-lg font-bold">{promise.title}</h3>
                <p className="mt-2 text-base text-muted-foreground">
                  {promise.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" aria-labelledby="about-who">
        <div className="site-container max-w-[48rem]">
          <h2 id="about-who" className="site-h2">
            Who runs it
          </h2>
          <p className="site-lede mt-4 text-muted-foreground">
            Tropos is operated by Myles Kennedy. Questions, ideas and problems
            go to{" "}
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

      <GetTheApp badge />
    </SiteLayout>
  );
}
