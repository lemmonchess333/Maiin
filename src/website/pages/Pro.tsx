import { Check, CircleCheck } from "lucide-react";
import { FREE_KEEPS, PRO_INCLUDES } from "@/components/paywall/proIncludesCopy";
import {
  PRO_PLANS,
  TRIAL_DAYS,
  getInlinePriceSummary,
  getRenewalTerms,
} from "@/lib/proPlans";
import AppScreen from "@/website/site/AppScreen";
import GetTheApp from "@/website/site/GetTheApp";
import { KICKER_CLASS } from "@/website/site/domains";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

const QUESTIONS: readonly { q: string; a: string }[] = [
  {
    q: "Can I buy Pro on this website?",
    a: "No. Pro is bought in the app, through the App Store.",
  },
  {
    q: "How do I cancel?",
    a: "In your Apple Account’s subscriptions, at least 24 hours before the period ends. Pro stays on until then.",
  },
  {
    q: "What happens to my plan if Pro ends?",
    a: `${FREE_KEEPS} A half marathon or longer plan needs Pro after its first week.`,
  },
];

/**
 * The Pro page. Every line is the app's own: what Pro includes and what
 * Free keeps are the Pro page's lists (`proIncludesCopy.ts`), and the
 * prices, the trial and the renewal terms are `proPlans.ts`'s, so the
 * website can never say a different price or a different list.
 *
 * It is also the page at `/upgrade`, the app's Pro address (firebase.json
 * rewrites it here), and `checkoutDone` is the line for RevenueCat's
 * checkout returning there (`/upgrade?checkout=success`, #3375's words: the
 * parameter is unsigned, so the line says what is true if they just paid).
 */
export default function ProPage({
  checkoutDone = false,
}: {
  checkoutDone?: boolean;
}) {
  return (
    <SiteLayout current="/pro">
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[70rem] items-start gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-16">
          <div>
            {checkoutDone && (
              <div
                role="status"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-success/30 bg-card p-3 text-sm font-medium text-foreground"
              >
                <CircleCheck
                  className="mt-0.5 size-4 shrink-0 text-success-strong"
                  aria-hidden="true"
                />
                <span>
                  If you just paid, Pro is on for your account in the Tropos
                  app.
                </span>
              </div>
            )}
            <p
              className={`text-[0.9375rem] font-semibold ${KICKER_CLASS.brand}`}
            >
              Tropos Pro
            </p>
            <h1 className="mt-3 text-h1 font-extrabold leading-[1.08] tracking-tight text-foreground text-balance lg:text-[3.5rem]">
              What Pro adds
            </h1>
            <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">
              Pro keeps your calorie target, macros and running paces up to date
              as you log, weigh in and run, and adds logging a meal from a
              photo.
            </p>
            <ul
              aria-label="What Pro includes"
              className="mt-8 space-y-3 text-base text-foreground"
            >
              {PRO_INCLUDES.map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <Check
                    className="mt-1 size-4 shrink-0 text-lifting-strong"
                    aria-hidden="true"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[17.5rem] site-light site-light-lifting lg:max-w-[20rem]">
            <AppScreen screen={SCREENS.proPlans} eager />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="price"
        className="mx-auto max-w-[70rem] px-4 pb-14 lg:px-8 lg:pb-20"
      >
        <div className="rounded-2xl bg-card p-4 card-shadow lg:p-10">
          <h2
            id="price"
            className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.25rem]"
          >
            What it costs
          </h2>
          <p className="mt-4 font-figure text-[2rem] font-extrabold leading-tight tabular-nums text-foreground lg:text-[2.5rem]">
            {getInlinePriceSummary(PRO_PLANS)}
          </p>
          <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            {TRIAL_DAYS} days free on either plan, then{" "}
            {getInlinePriceSummary(PRO_PLANS)}. {getRenewalTerms("ios")} The
            free trial is for new subscribers.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Prices are the UK’s. The App Store shows the price where you are.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="questions"
        className="mx-auto max-w-[70rem] px-4 pb-14 lg:px-8 lg:pb-20"
      >
        <h2
          id="questions"
          className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.25rem]"
        >
          Questions
        </h2>
        <dl className="mt-6 max-w-2xl divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {QUESTIONS.map(({ q, a }) => (
            <div key={q} className="py-5">
              <dt className="text-lg font-bold text-foreground">{q}</dt>
              <dd className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                {a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <GetTheApp
        heading={`Try Pro free for ${TRIAL_DAYS} days`}
        line="Start the trial in the app. It’s for new subscribers."
      />
    </SiteLayout>
  );
}
