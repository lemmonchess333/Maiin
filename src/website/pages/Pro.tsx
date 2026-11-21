import { useLocation } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { FREE_KEEPS, PRO_INCLUDES } from "@/components/paywall/proIncludesCopy";
import {
  PRO_PLANS,
  TRIAL_DAYS,
  findPlan,
  getBilledPriceLine,
  getRenewalTerms,
} from "@/lib/proPlans";
import AppStoreBadge from "@/website/AppStoreBadge";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import { normalisePath, sitePage } from "@/website/sitePages";
import { useLandingContext } from "@/website/useLandingContext";
import { sitePageHead, usePageHead } from "@/website/usePageHead";
import SiteHeadline from "@/website/blocks/SiteHeadline";

const YEARLY = findPlan(PRO_PLANS, "yearly");
const MONTHLY = findPlan(PRO_PLANS, "monthly");

/** Questions a visitor asks before subscribing, answered from the app's
 *  own terms (`proPlans.ts`, `proIncludesCopy.ts`). */
const QUESTIONS = [
  {
    q: "Do I need Pro to use Tropos?",
    a: FREE_KEEPS,
  },
  {
    q: "How does the free trial work?",
    a: `New subscribers get ${TRIAL_DAYS} days free. Payment is taken from your Apple Account when the trial ends, unless you cancel before then.`,
  },
  {
    q: "How do I cancel?",
    a: "In your Apple Account’s subscriptions on your iPhone, at least 24 hours before the current period ends.",
  },
  {
    q: "Can I buy Pro on this website?",
    a: "Not yet. Pro is sold in the Tropos app, through the App Store.",
  },
] as const;

/**
 * troposfit.com/pro: what Pro adds, in the Pro page's own list
 * (`PRO_INCLUDES`), what stays free (`FREE_KEEPS`), and the price as the
 * app states it (`PRO_PLANS`, the pound prices the paywall shows until the
 * App Store's arrive). Nothing here sells: the website does not take
 * payment (App1 Q77, option 4).
 */
export default function Pro() {
  const { pathname } = useLocation();
  // At the app's old Pro address (`/upgrade`) the page names /pro as its
  // canonical copy and asks not to be indexed itself.
  usePageHead({
    ...sitePageHead(sitePage("pro")),
    noindex: normalisePath(pathname) !== "/pro",
  });
  const { note } = useLandingContext();
  return (
    <SiteLayout>
      <section className="site-container grid gap-10 pt-6 pb-14 md:grid-cols-[1.1fr_1fr] md:items-start md:pt-12 lg:pb-24">
        <div>
          {note === "checkoutDone" && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-card border border-success/30 text-sm font-medium"
            >
              <CircleCheck
                className="size-4 shrink-0 mt-0.5 text-success-strong"
                aria-hidden="true"
              />
              <span>
                If you just paid, Pro is on for your account in the Tropos app.
              </span>
            </div>
          )}
          <p className="site-kicker text-lifting-strong">Tropos Pro</p>
          <SiteHeadline className="mt-2">What Pro adds</SiteHeadline>
          <p className="site-lede mt-4 text-muted-foreground max-w-[34rem]">
            Pro reads your meal photos, adapts your calorie target to what you
            log and weigh, and moves your paces as you get fitter. Your training
            plan stays free.
          </p>
          <div className="mt-5">
            <AppStoreBadge />
          </div>
          <div className="mt-2 rounded-[24px] bg-card card-shadow p-6">
            <p className="text-lg font-bold">
              {getBilledPriceLine(YEARLY, true)}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              Or {MONTHLY.price} {MONTHLY.periodPhrase}. The App Store shows the
              price in your own currency.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {`The ${TRIAL_DAYS}-day free trial is for new subscribers. ${getRenewalTerms("ios")}`}
            </p>
          </div>
        </div>
        <ul className="rounded-[28px] bg-card card-shadow p-6 md:p-8 space-y-4">
          {PRO_INCLUDES.map((line) => (
            <li key={line} className="flex gap-3 text-base">
              <CircleCheck
                className="size-5 shrink-0 mt-0.5 text-lifting-strong"
                aria-hidden="true"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-section" aria-labelledby="pro-questions">
        <div className="site-container max-w-[48rem]">
          <h2 id="pro-questions" className="site-h2">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-border/70 border-y border-border/70">
            {QUESTIONS.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex items-center justify-between gap-4 min-h-[56px] py-3 cursor-pointer list-none text-base font-semibold">
                  {q}
                  <span
                    aria-hidden="true"
                    className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-4 text-base text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <GetTheApp
        title="Try Pro in the app"
        line={`Download Tropos, set up your plan, and start the ${TRIAL_DAYS}-day free trial in the app when you want it.`}
      />
    </SiteLayout>
  );
}
