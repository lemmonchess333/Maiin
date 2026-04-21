import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div>
          <h1 className="text-xl font-extrabold text-foreground">Terms of Service</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: March 2026
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
                Tropos offers free and Pro subscription tiers.
              </li>
              <li>
                Subscriptions auto-renew at the selected interval (monthly or
                annually) unless cancelled at least 24 hours before the end of
                the current billing period.
              </li>
              <li>
                You can manage or cancel your subscription at any time through
                your device settings or the App Store.
              </li>
              <li>
                Lifetime purchases are a one-time payment with no recurring
                charges.
              </li>
              <li>
                Refunds are handled according to the policies of the platform
                through which you subscribed (Apple App Store, Google Play, or
                web).
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
              violates these Terms or our Community Guidelines.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              7. Health Disclaimer
            </h2>
            <p>
              Tropos is a fitness tracking tool, not a medical device. The App
              does not provide medical advice, diagnosis, or treatment.
              AI-generated nutrition and training suggestions are estimates only.
              Always consult a qualified healthcare professional before making
              changes to your diet or exercise routine.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              8. Limitation of Liability
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
              9. Account Termination
            </h2>
            <p>
              We may suspend or terminate your account if you violate these
              Terms. You can delete your account at any time from Settings &gt;
              Delete Account. Upon deletion, all personal data is permanently
              removed within 30 days.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              10. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of
              significant changes through the App. Continued use after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              11. Contact
            </h2>
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
