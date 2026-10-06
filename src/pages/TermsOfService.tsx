import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pt-[var(--safe-top)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 min-h-[44px] -my-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <div>
          <h1 className="text-xl font-extrabold text-foreground">
            Terms of Service
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: October 2026
          </p>
        </div>

        <div className="space-y-5 text-sm text-foreground/80 leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              1. Acceptance of Terms
            </h2>
            <p>
              By creating an account or using Tropos ("the App"), you agree to
              these Terms of Service. If you do not agree, do not use the App.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              2. Eligibility
            </h2>
            <p>
              You must be at least 16 years old to use Tropos. By using the App,
              you represent that you meet this age requirement.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              3. Account Responsibilities
            </h2>
            <p>
              You are responsible for maintaining the security of your account
              credentials and for all activity that occurs under your account.
              Notify us immediately if you suspect unauthorized access.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Subscriptions &amp; Payments
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Tropos is free to use. Tropos Pro is an optional paid
                subscription.
              </li>
              <li>
                Pro is offered as a monthly or a yearly auto-renewing
                subscription, bought through Apple&apos;s In-App Purchase. The
                price and billing period are shown before you confirm.
              </li>
              <li>
                Payment is charged to your Apple ID account when you confirm the
                purchase. Where a free trial is offered, it becomes a paid
                subscription when it ends unless you cancel before then.
              </li>
              <li>
                A subscription renews automatically at the end of each billing
                period unless auto-renew is turned off at least 24 hours before
                the period ends. Your account is charged for the renewal within
                the 24 hours before the period ends.
              </li>
              <li>
                You can manage or cancel your subscription at any time in your
                Apple ID account settings. Cancelling stops the next renewal;
                Pro stays active until the end of the period you have paid for.
              </li>
              <li>
                Refunds are handled by Apple under its own policies. We cannot
                cancel or refund App Store purchases on your behalf.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              5. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Use the App for any unlawful purpose</li>
              <li>
                Post content that is abusive, harassing, defamatory, or
                otherwise objectionable
              </li>
              <li>
                Attempt to gain unauthorized access to the App or its systems
              </li>
              <li>
                Scrape, copy, or redistribute content from the App without
                permission
              </li>
              <li>Impersonate another person or entity</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              6. User-Generated Content
            </h2>
            <p>
              Content you share publicly (e.g. social feed posts, activity
              summaries) remains yours but you grant Tropos a non-exclusive
              licence to display it within the App. We may remove content that
              violates these Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              7. Objectionable Content and Abusive Users
            </h2>
            <p>
              Tropos has zero tolerance for objectionable content and abusive
              users. You may not post anything that other people can see,
              whether a post, comment, caption, photo or display name, that:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>harasses, bullies, threatens or abuses anyone</li>
              <li>is hateful or discriminatory, including slurs</li>
              <li>is sexually explicit</li>
              <li>is violent or graphic, or encourages self-harm</li>
              <li>is spam, a scam or deliberately misleading</li>
              <li>impersonates another person or organisation</li>
              <li>is otherwise unlawful or objectionable</li>
            </ul>
            <p>
              Tropos filters objectionable language out of what is posted. You
              can report a post, comment or profile, and block the person behind
              it. Reports are reviewed within 24 hours.
            </p>
            <p>
              Content that breaks these rules is removed, and the accounts that
              post it can be suspended or removed from Tropos without notice.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              8. Health Disclaimer
            </h2>
            <p>
              Tropos is a fitness tracking tool, not a medical device. The App
              does not provide medical advice, diagnosis, or treatment.
              AI-generated nutrition and training suggestions are estimates
              only. Always consult a qualified healthcare professional before
              making changes to your diet or exercise routine.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              9. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Tropos and its creators
              shall not be liable for any indirect, incidental, or consequential
              damages arising from your use of the App. The App is provided "as
              is" without warranties of any kind.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              10. Account Termination
            </h2>
            <p>
              We may suspend or terminate your account if you violate these
              Terms. You can delete your account at any time from Settings &gt;
              Account &gt; Delete account. We remove your account data and
              login; interrupted cleanup continues in the background. Limited
              security, moderation, and billing records remain for the purposes
              and periods described in our Privacy Policy. Meal photos live on
              your device rather than our servers, so they are cleared from the
              device you delete from; see the Privacy Policy for what that does
              and does not reach.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              11. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of
              significant changes through the App. Continued use after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              12. Contact
            </h2>
            <p>
              Tropos is operated by{" "}
              <strong className="text-foreground">Myles Kennedy</strong>,
              trading as Tropos. These Terms are an agreement between you and
              him.
            </p>
            <p>
              For questions about these Terms, please contact us at
              support@troposfit.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
