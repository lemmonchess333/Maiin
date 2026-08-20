import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Back button */}
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
            Privacy Policy
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: August 2026
          </p>
        </div>

        <div className="space-y-5 text-sm text-foreground/80 leading-relaxed">
          {/* Data controller. UK GDPR Art. 13(1)(a) requires the identity
              and contact details of the controller, and "Tropos" alone
              cannot satisfy it — a trading name is not a legal person, so
              a data subject reading this could not tell who is
              responsible. Tropos currently trades as a sole trader, which
              makes the individual the controller.

              MUST BE UPDATED ON INCORPORATION: if Tropos becomes a limited
              company, the COMPANY becomes the controller and this section
              names it (plus its company number) instead of an individual.
              Pinned by `legalCopyClaims.test.ts` so the section cannot
              simply vanish; the test cannot know which is currently true,
              so this comment is the reminder. */}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              Who we are
            </h2>
            <p>
              Tropos is operated by{" "}
              <strong className="text-foreground">Myles Kennedy</strong>,
              trading as Tropos, who is the data controller for the personal
              data described in this policy. For any question about your data,
              or to exercise any of the rights in sections 5 and 6, contact{" "}
              <strong className="text-foreground">support@troposfit.com</strong>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              1. Information We Collect
            </h2>
            <p>
              Tropos collects the following information when you create an
              account and use the app:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  Account Information:
                </strong>{" "}
                Email address and display name
              </li>
              <li>
                <strong className="text-foreground">Body Metrics:</strong>{" "}
                Weight and height for personalized tracking
              </li>
              <li>
                <strong className="text-foreground">Activity Data:</strong>{" "}
                Workout logs, meal counts, personal records, and notes
              </li>
              <li>
                <strong className="text-foreground">Preferences:</strong> Unit
                preferences, theme settings, and fitness goals
              </li>
              <li>
                <strong className="text-foreground">
                  GPS and Location Data:
                </strong>{" "}
                Route coordinates during run tracking for mapping and pace
                calculation. You can define <strong>privacy zones</strong>{" "}
                around sensitive locations (for example, your home or
                workplace); GPS points that fall inside a zone are removed from
                a route before it is saved or shared.
              </li>
              <li>
                <strong className="text-foreground">Nutrition Data:</strong>{" "}
                Food logs, barcode scans, calorie and macro tracking data
              </li>
              <li>
                <strong className="text-foreground">Body Measurements:</strong>{" "}
                Weight logs over time for trend tracking
              </li>
              <li>
                <strong className="text-foreground">
                  Progress Photos (optional):
                </strong>{" "}
                If you choose to add progress photos, they are encrypted on your
                device with AES-GCM before they are uploaded, so they are never
                stored as plain image files. See section 3 for what that does
                and does not mean.
              </li>
              <li>
                <strong className="text-foreground">
                  Meal Photos (optional):
                </strong>{" "}
                If you use the camera to log a meal, the photo is sent to Google
                for analysis and then kept{" "}
                <strong className="text-foreground">
                  only on the device that took it
                </strong>{" "}
                — we do not store it on our servers. It is deleted automatically
                after 90 days. See section 7 for the detail.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              2. How We Use Your Data
            </h2>
            <p>Your data is used exclusively to:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Display your personalized fitness dashboard</li>
              <li>Track your workout and nutrition progress over time</li>
              <li>Calculate performance metrics and achievement badges</li>
              <li>Sync your data across your devices</li>
              <li>Diagnose errors and improve app stability (crash reports)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              3. Data Storage & Security
            </h2>
            <p>
              Your data is stored securely using Google Firebase with
              industry-standard encryption. Data is transmitted over HTTPS and
              stored in encrypted databases. We use Firebase Authentication for
              secure user authentication.
            </p>
            <p>
              <strong className="text-foreground">Progress photos</strong> are
              additionally encrypted on your device (AES-GCM-256) before upload,
              so they are never stored as plain image files &mdash; anyone
              browsing raw storage sees ciphertext rather than pictures.
            </p>
            <p>
              To be precise about what that protects: this is{" "}
              <strong className="text-foreground">not</strong> end-to-end
              encryption. The encryption key is derived from your account
              identifier rather than from a password only you know, so Tropos is
              technically able to decrypt your progress photos. We would rather
              state that plainly than imply a protection we do not provide.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Data Sharing
            </h2>
            <p>
              We do <strong>not</strong> sell or rent your personal data. Your
              logged fitness data is private to your account by default. Sharing
              to the social feed is always an explicit action — when you share,
              you choose each post's audience:{" "}
              <strong className="text-foreground">public</strong>,{" "}
              <strong className="text-foreground">followers only</strong>, or{" "}
              <strong className="text-foreground">private</strong>. Nothing is
              published automatically.
            </p>
            <p>
              Some data is processed by the third-party services listed in
              section 7 (e.g. Firebase for storage, AI services for food photo
              analysis). These services process data solely to provide their
              functionality to you.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              5. Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Access all data we store about you</li>
              <li>Update or correct your personal information</li>
              <li>
                Delete your account from within the app (Settings &gt; Delete
                Account). Everything we hold is erased immediately, and meal
                photos are cleared from the device you delete from — see section
                6 for the one thing this cannot reach.
              </li>
              <li>Export your data in a standard format</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              6. GDPR Compliance
            </h2>
            <p>
              If you are located in the UK or European Economic Area, you have
              additional rights under the General Data Protection Regulation
              (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Legal basis:</strong> We
                process your data based on your consent (provided during account
                creation) and for the performance of our service.
              </li>
              <li>
                <strong className="text-foreground">Right to access:</strong>{" "}
                You can request a copy of all data we hold about you.
              </li>
              <li>
                <strong className="text-foreground">
                  Right to rectification:
                </strong>{" "}
                You can update or correct your personal information through the
                app settings.
              </li>
              <li>
                <strong className="text-foreground">Right to erasure:</strong>{" "}
                You can request deletion of your account and all associated
                data.
              </li>
              <li>
                <strong className="text-foreground">
                  Right to data portability:
                </strong>{" "}
                You can export your data in CSV format through the app's
                settings.
              </li>
              <li>
                <strong className="text-foreground">
                  Right to withdraw consent:
                </strong>{" "}
                You can withdraw consent at any time by deleting your account.
              </li>
              <li>
                <strong className="text-foreground">Data retention:</strong> We
                retain your data for as long as your account is active. When you
                delete your account, everything held on our servers is erased{" "}
                <strong className="text-foreground">immediately</strong> — it is
                not queued for later deletion.
              </li>
              <li>
                <strong className="text-foreground">
                  One limit on erasure, stated plainly:
                </strong>{" "}
                meal photos are not on our servers, so there is nothing there
                for us to erase — and equally, no process of ours can reach a
                phone. Deleting your account clears them from the device you
                delete from. If you have signed in on another device, that
                device keeps its copies until they expire after 90 days or you
                delete the app there.
              </li>
            </ul>
            <p>
              For GDPR-related requests, contact us at: support@troposfit.com
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              7. Third-Party Services
            </h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Firebase (Google):</strong>{" "}
                Authentication, data storage, and analytics
              </li>
              <li>
                <strong className="text-foreground">
                  Apple StoreKit / Stripe:
                </strong>{" "}
                Subscription and payment processing (platform-dependent)
              </li>
              <li>
                <strong className="text-foreground">
                  AI Food Analysis (Google Gemini):
                </strong>{" "}
                Food photos and text descriptions may be processed by Google
                Gemini AI to estimate nutritional content. Photos are
                temporarily processed and not permanently retained by Google. We
                do not use your food photos for AI model training.{" "}
                <strong className="text-foreground">
                  Tropos does not store your food photos on its servers.
                </strong>{" "}
                After analysis, the photo is kept only on the device that took
                it, so your meal diary can show it. It is not backed up to
                iCloud, does not sync between your devices, and is deleted
                automatically after 90 days — the furthest back the diary can be
                viewed. Deleting the app, or getting a new phone, removes these
                photos; your logged meals and their nutrition data are
                unaffected.
              </li>
              <li>
                <strong className="text-foreground">MapLibre:</strong> Map
                rendering for run routes (no personal data shared)
              </li>
              <li>
                <strong className="text-foreground">
                  Route Planning (Mapbox):
                </strong>{" "}
                If you use the optional road-aware route planner, the map points
                you tap (or, for a generated loop, your chosen start point plus
                a handful of nearby points we compute from it and your chosen
                distance) are sent to Mapbox&apos;s Directions service to
                calculate a walking route. We send only those coordinates —
                never your name, account details, saved routes, or run history —
                and we do not store or log the coordinates you submit. Planned
                routes are saved privately to your account only when you choose
                Save &amp; follow.
              </li>
            </ul>
            <p>
              These services have their own privacy policies governing data
              handling.
            </p>
            <p>
              <strong className="text-foreground">Error Reporting:</strong> We
              automatically collect crash reports and error logs to improve app
              stability. Reports include error messages and stack traces but do
              not contain sensitive personal data such as passwords, meal
              content, or workout details.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              8. Health &amp; Fitness Data
            </h2>
            <p>
              Tropos collects health and fitness data including body weight,
              nutrition intake, workout performance, and GPS running data. This
              data is used solely to provide personalised fitness tracking and
              is never used for advertising, marketing, or data mining purposes.
            </p>
            <p>
              <strong className="text-foreground">Disclaimer:</strong> Tropos is
              a fitness tracking tool, not a medical device. The app does not
              provide medical advice, diagnosis, or treatment. AI-generated
              nutrition and training suggestions are estimates only. Always
              consult a qualified healthcare professional before making changes
              to your diet or exercise routine.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              9. Children's Privacy
            </h2>
            <p>
              Tropos is not intended for children under 16. We do not knowingly
              collect data from children under 16.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. We will
              notify you of significant changes through the app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              11. Contact
            </h2>
            <p>
              For questions about this privacy policy or your data, please
              contact us at support@troposfit.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
