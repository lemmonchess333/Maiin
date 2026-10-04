import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/* What this page says is what the App Store privacy label is filed from,
   so it describes what the code does, service by service and data type by
   data type. The claims code can contradict are pinned in
   src/lib/__tests__/legalCopyClaims.test.ts; change a claim and its pin
   together, and change the code and the claim together. */
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
            Last updated: October 2026
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
                your email address, your display name and how you sign in (email
                and password, Google or Apple). If you sign in with Apple, Apple
                may give us a private relay address instead of your own.
              </li>
              <li>
                <strong className="text-foreground">
                  Profile and Fitness Details:
                </strong>{" "}
                sex or gender, age range, height and weight, activity level and
                training experience, any injury limits you tell us about, your
                maximum heart rate, your goals (including a goal weight), and
                the details of any race you are training for, such as its
                distance, date and event.
              </li>
              <li>
                <strong className="text-foreground">Activity Data:</strong>{" "}
                workouts, sets and personal records, runs, meals, water, weight
                logs over time, your notes, and the training plan you follow.
              </li>
              <li>
                <strong className="text-foreground">
                  Location During Runs:
                </strong>{" "}
                while a run is recording, your GPS position, including when the
                app is in the background or the screen is locked, so the route,
                distance and pace are complete. A route is recorded only while a
                run is recording. At other times the app uses your position only
                for something you ask for: an approximate position (to about a
                kilometre) for the weather before a run, the start of a route
                you plan, or the place of a privacy zone you add. GPS points
                that fall inside a <strong>privacy zone</strong> (for example
                around your home or workplace) are removed from a route before
                it is saved or shared.
              </li>
              <li>
                <strong className="text-foreground">Nutrition Data:</strong>{" "}
                food logs, barcode scans, food searches, and calorie and macro
                tracking data.
              </li>
              <li>
                <strong className="text-foreground">
                  Apple Health (optional):
                </strong>{" "}
                if you connect it, today&apos;s step count, read to show on
                Home. See section 8.
              </li>
              <li>
                <strong className="text-foreground">
                  Progress Photos (optional):
                </strong>{" "}
                if you add progress photos, new ones are encrypted on your
                device with AES-GCM before they are uploaded. Some older photos
                were stored in an earlier format without that encryption. See
                section 3 for what the encryption does and does not mean. If you
                share one, the image is made on your device and goes only where
                you send it from your phone&apos;s share sheet; Tropos does not
                post it anywhere.
              </li>
              <li>
                <strong className="text-foreground">
                  Meal Photos (optional):
                </strong>{" "}
                if you use the camera to log a meal, and you have allowed AI
                food analysis, the photo is sent to Google for analysis and then
                kept{" "}
                <strong className="text-foreground">
                  only on the device that took it
                </strong>{" "}
                — we do not store it on our servers. It is deleted automatically
                after 90 days. See section 7 for the detail.
              </li>
              <li>
                <strong className="text-foreground">
                  Profile and Space Photos (optional):
                </strong>{" "}
                the profile photo you set, and photos you attach to a Space
                post.
              </li>
              <li>
                <strong className="text-foreground">
                  Social Activity (optional):
                </strong>{" "}
                the posts you share, comments, kudos, follows, Circle check-ins,
                Space posts, and the reports you make about content or accounts.
              </li>
              <li>
                <strong className="text-foreground">
                  Subscription Records:
                </strong>{" "}
                whether you have Pro, where you bought it, its product and
                dates, and the store&apos;s transaction identifiers.
              </li>
              <li>
                <strong className="text-foreground">
                  Usage Data and Analytics Identifiers:
                </strong>{" "}
                which screens and features you use, and events such as finishing
                a workout, a run or a scan, with a few figures about them, tied
                to an identifier for this installation of the app. See section
                2.
              </li>
              <li>
                <strong className="text-foreground">
                  Crash and Error Reports:
                </strong>{" "}
                error messages and where in the app they happened.
              </li>
              <li>
                <strong className="text-foreground">
                  Preferences and Time Zone:
                </strong>{" "}
                units, theme, notification and sharing choices, and your
                device&apos;s time zone, so daily limits and reminders follow
                your local day.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              2. How We Use Your Data
            </h2>
            <p>We use your data to:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Run the app: your dashboard, plan, logs and progress</li>
              <li>Calculate performance figures, streaks and badges</li>
              <li>Sync your data across your devices</li>
              <li>Show what you choose to share to other people in the app</li>
              <li>
                Estimate what is in a meal photo or a typed meal, if you allow
                it (section 7)
              </li>
              <li>Send account emails, such as a password reset</li>
              <li>
                Understand how the app is used and fix what breaks (analytics,
                and crash and error reports)
              </li>
            </ul>
            <p>
              <strong className="text-foreground">Analytics.</strong> Google
              Analytics for Firebase receives the usage events described in
              section 1, including some fitness figures about sessions, such as
              how long one took or how many items were logged. Google also works
              out an approximate location, such as the country or city, from
              your connection. Analytics never receives your email address, your
              name, GPS routes, what you type about meals, or your notes.
            </p>
            <p>
              We do not use your data for advertising, Tropos shows no adverts,
              and we do not sell your data.
            </p>
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
              <strong className="text-foreground">New progress photos</strong>{" "}
              are additionally encrypted on your device (AES-GCM-256) before
              upload, so they are not stored as plain image files &mdash; anyone
              browsing raw storage sees ciphertext rather than pictures.
            </p>
            <p>
              To be precise about what that protects: this is{" "}
              <strong className="text-foreground">not</strong> end-to-end
              encryption. New photos use a random key for each photo, kept in
              private account metadata separately from the image storage. This
              lets you access them after signing in on another device. Tropos
              can access these keys and is technically able to decrypt the
              photos. Older uploads can use a key derived from your account
              identifier or an unencrypted legacy format. Those photos do not
              gain the new protection unless they are uploaded again.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Data Sharing
            </h2>
            <p>
              We do <strong>not</strong> sell or rent your personal data.
            </p>
            <p>
              <strong className="text-foreground">
                What other people see.
              </strong>{" "}
              Your display name, profile photo, streaks and badges are visible
              to other signed-in Tropos users. Your logs (meals, weight,
              workouts and runs) are private to your account unless you share
              them. Comments, Circle check-ins and Space posts are seen by the
              people in that conversation, Circle or Space.
            </p>
            <p>
              <strong className="text-foreground">Sharing sessions.</strong>{" "}
              When you share a workout or a run, you choose its audience:{" "}
              <strong className="text-foreground">public</strong>,{" "}
              <strong className="text-foreground">followers only</strong>, or{" "}
              <strong className="text-foreground">private</strong>. You can also
              choose, in Settings &gt; Social &amp; privacy &gt; Sharing, to
              share runs or workouts automatically with your followers or
              publicly; each session of that kind you finish is then posted
              without asking. Until you choose, you are asked each time. A
              shared route has its start and end hidden unless you turn that
              off, and your privacy zones are removed from it.
            </p>
            <p>
              Some data goes to the services listed in section 7, each for the
              purpose stated there.
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
                Delete your account from within the app (Settings &gt; Account
                &gt; Delete account). We remove your profile, fitness logs,
                uploaded photos and public social content. Cleanup may continue
                in the background. See section 6 for what is kept and for photos
                on your devices.
              </li>
              <li>Export your data in a standard format</li>
              <li>
                Turn AI food analysis on or off at any time, in Settings &gt;
                Social &amp; privacy
              </li>
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
                creation, and when the app asks, as it does before AI food
                analysis) and for the performance of our service.
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
                You can withdraw consent at any time by deleting your account,
                and withdraw it for AI food analysis by turning it off in
                Settings &gt; Social &amp; privacy.
              </li>
              <li>
                <strong className="text-foreground">Data retention:</strong> We
                retain your data while your account is active. Deletion freezes
                new writes, removes your personal data, then removes your
                sign-in. Failed cleanup is retried in the background. We retain
                a minimal deletion record for 30 days and a protection record
                for 90 days. Non-public comment text and minimised moderation
                records may be retained for up to 365 days for safety review.
                Protected billing identifiers are retained for 13 months to
                prevent purchase theft. Expired records are removed by scheduled
                retention policies; removal is not instantaneous. An outstanding
                subscription cancellation request is kept until it is resolved.
                Deletion also leaves: the record that an account has used its
                free trial, which stops a second free trial; records of
                password-reset requests, which hold the email address a reset
                was asked for; and the records of Apple&apos;s subscription
                notifications, kept so each is handled once. Outside Tropos,
                RevenueCat keeps its subscription records, Stripe keeps its
                records of any purchase made on the web, and Google keeps
                analytics data under its Google Analytics retention settings,
                each under its own policy.
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
            <p>
              These services receive personal data to provide their part of
              Tropos:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Google (Firebase):</strong>{" "}
                Firebase Authentication (sign-in), Cloud Firestore (your data),
                Cloud Storage (progress, profile and Space photos), Cloud
                Functions (our server code), App Check (which checks that
                requests come from the real app; on the web it uses reCAPTCHA)
                and Google Analytics for Firebase (usage analytics, section 2).
              </li>
              <li>
                <strong className="text-foreground">
                  AI Food Analysis (Google Gemini):
                </strong>{" "}
                if you allow it, the photo you take of a meal or a nutrition
                label, or a meal you type (Pro), is sent to Google&apos;s Gemini
                on Vertex AI to estimate what is in it and its macros. Tropos
                asks before the first one is sent, and you can turn it off at
                any time in Settings &gt; Social &amp; privacy. Google processes
                it to return the estimate and may hold it briefly under its
                terms for this service, for example to detect abuse. Google does
                not use it to train its models.{" "}
                <strong className="text-foreground">
                  Tropos does not store your food photos on its servers.
                </strong>{" "}
                After analysis, the photo is kept only on the device that took
                it, so your meal diary can show it. It is not backed up to
                iCloud, does not sync between your devices, and is deleted
                automatically after 90 days — the furthest back the diary can be
                viewed. Deleting the app, or getting a new phone, removes these
                photos; your logged meals and their nutrition data are
                unaffected. Barcode scans do not use AI: the barcode is read on
                your phone and looked up in Open Food Facts (below).
              </li>
              <li>
                <strong className="text-foreground">Apple:</strong> Sign in with
                Apple (if you use it), Apple Health (reads today&apos;s step
                count, section 8), In-App Purchase (Pro bought in the app; Apple
                handles the payment) and App Attest (which confirms that
                requests come from the real app on your iPhone).
              </li>
              <li>
                <strong className="text-foreground">RevenueCat:</strong> manages
                Pro subscriptions. It holds your Tropos account ID and your
                purchase history.
              </li>
              <li>
                <strong className="text-foreground">Stripe:</strong> payments
                for Pro bought on the web. Stripe handles the card details; we
                receive the subscription&apos;s status and Stripe&apos;s
                customer and subscription identifiers.
              </li>
              <li>
                <strong className="text-foreground">Resend:</strong> sends
                account emails, such as verifying your email address or
                resetting your password. It receives your email address and the
                email.
              </li>
              <li>
                <strong className="text-foreground">Open Food Facts:</strong>{" "}
                barcode lookups and food searches. The barcode or the words you
                search for go straight from your phone, with its IP address; no
                account details are sent.
              </li>
              <li>
                <strong className="text-foreground">OpenFreeMap:</strong> the
                maps. It receives the area of the map being shown and your IP
                address.
              </li>
              <li>
                <strong className="text-foreground">
                  MET Norway (weather):
                </strong>{" "}
                the weather before a run. Our server asks for the forecast at
                your approximate location (to about a kilometre); MET Norway
                never sees your phone or your account.
              </li>
              <li>
                <strong className="text-foreground">
                  Route Planning (Mapbox):
                </strong>{" "}
                If you use the optional road-aware route planner, the map points
                you tap (or, for a generated loop, your chosen start point plus
                a handful of nearby points we compute from it and your chosen
                distance) are sent from our server to Mapbox&apos;s Directions
                service to calculate a walking route. We send only those
                coordinates — never your name, account details, saved routes, or
                run history — and we do not store or log the coordinates you
                submit. Planned routes are saved privately to your account only
                when you choose Save &amp; follow.
              </li>
              <li>
                <strong className="text-foreground">GitHub:</strong> the
                exercise demonstration images come from a public library hosted
                on GitHub, which receives your IP address only.
              </li>
            </ul>
            <p>
              These services have their own privacy policies governing data
              handling.
            </p>
            <p>
              <strong className="text-foreground">Error Reporting:</strong> We
              automatically collect crash reports and error logs to improve app
              stability. They are stored with your account. Reports include
              error messages and stack traces but do not contain sensitive
              personal data such as passwords, meal content, or workout details.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              8. Health & Fitness Data
            </h2>
            <p>
              Tropos keeps the health and fitness data you log, including body
              weight, nutrition, workouts and GPS running data, to provide your
              fitness tracking. It is never used for advertising or marketing,
              and never sold. Some figures about sessions reach Google Analytics
              as described in section 2.
            </p>
            <p>
              <strong className="text-foreground">Apple Health.</strong> If you
              connect Apple Health, Tropos reads one thing from it: today&apos;s
              step count, to show it on Home. Tropos never writes to Apple
              Health. The step count is never stored and never sent anywhere,
              and it is never used for advertising. Tropos keeps only whether
              you connected Apple Health. You can remove its access at any time
              in the Health app.
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
