import LegalBack from "@/components/legal/LegalBack";

/* What this page says is what the App Store privacy label is filed from,
   so it describes what the code does, service by service and data type by
   data type. The claims code can contradict are pinned in
   src/lib/__tests__/legalCopyClaims.test.ts; change a claim and its pin
   together, and change the code and the claim together. */

/** Why Tropos may use the data for each purpose (UK GDPR Articles 6 and 9),
 *  shown as section 6's table. The health row names the explicit consent
 *  the health data screen asks for (legal audit 3.1, owner's lock Priv1):
 *  in setup, or once on the next open for an account made before it. The
 *  analytics row names the Share usage analytics switch (Priv1). Both are
 *  true only once their branches (claude/health-data-consent,
 *  claude/usage-analytics-switch) are on main, so this page merges after
 *  them. */
const LEGAL_BASES: ReadonlyArray<{ purpose: string; basis: string }> = [
  {
    purpose:
      "Your account, your plan and logs, recording a run’s route, syncing your devices, showing what you share, segments, challenges and leagues you join, Pro, and emails about your account or a trial ending",
    basis: "Contract: it is the service you signed up for.",
  },
  {
    purpose:
      "Your health details: weight, height, sex, injuries, the food diary, heart rate from your runs, and what you allow from Apple Health",
    basis:
      "Your explicit consent (UK GDPR Article 9(2)(a)), which you give in setup before the questions about your body, or, for an account made before that question was added, the first time you open Tropos after the update. You can withdraw it by deleting your account.",
  },
  {
    purpose: "Sending a meal photo or a typed meal to Google’s Gemini",
    basis:
      "Your consent, asked before the first one is sent. You can turn it off at any time.",
  },
  {
    purpose: "Notifications",
    basis: "Your consent, which you give when your phone or browser asks.",
  },
  {
    purpose: "Usage analytics, and crash and error reports",
    basis:
      "Legitimate interests: knowing how the app is used and fixing what breaks. You can turn usage analytics off in Settings > Social & privacy, and object to the rest (section 5).",
  },
  {
    purpose:
      "Security, stopping abuse and moderation, including the records kept after an account is deleted",
    basis: "Legitimate interests: keeping Tropos and the people on it safe.",
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background pt-[var(--safe-top)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <LegalBack />

        <div>
          <h1 className="text-xl font-extrabold text-foreground">
            Privacy Policy
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: November 2026
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
                sex or gender, year of birth (an older account may hold an age
                or an age range instead), height and weight, activity level and
                training experience, any injury limits you tell us about, your
                maximum heart rate, your goals (including a goal weight), and
                the details of any race you are training for, such as its
                distance, date and event.
              </li>
              <li>
                <strong className="text-foreground">Activity Data:</strong>{" "}
                workouts, sets and personal records, runs, meals, water, weight
                logs over time, your notes, and the training plan you follow.
                Also the routes you save to follow again (a route you import,
                plan or keep from a run), and the running shoes you add with the
                distance run in each.
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
                <strong className="text-foreground">
                  Motion During Runs (iPhone):
                </strong>{" "}
                while a run with auto-pause on is recording, your phone’s motion
                and step data, to pause the clock when you stop and start it
                again as you set off. It is read on your phone and is not stored
                or sent to Tropos.
              </li>
              <li>
                <strong className="text-foreground">Nutrition Data:</strong>{" "}
                food logs, including foods you add from a barcode scan or a
                search and the barcode of a food you scan, and calorie and macro
                tracking data. The words you type in a food search go straight
                from your phone to Open Food Facts, and Tropos keeps none of
                your searches (section 7).
              </li>
              <li>
                <strong className="text-foreground">
                  Apple Health (optional):
                </strong>{" "}
                if you connect it, your daily step count, which Pro compares
                with your activity level. With Pro, if you add them, your sleep,
                resting heart rate and heart rate variability for readiness.
                When available, Apple Watch runs also read heart rate during a
                run, and saving a completed Tropos run as a workout in Apple
                Health is a separate choice. See section 8.
              </li>
              <li>
                <strong className="text-foreground">
                  Heart rate sensor (optional):
                </strong>{" "}
                if you pair a Bluetooth chest strap or armband, Tropos reads
                your heart rate from it during a run. See section 8.
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
                you send it from your phone’s share sheet; Tropos does not post
                it anywhere.
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
                </strong>
                ; we do not store it on our servers. It is deleted automatically
                after 90 days. See section 7 for the detail.
              </li>
              <li>
                <strong className="text-foreground">
                  Profile, Post and Space Photos (optional):
                </strong>{" "}
                the profile photo you set, photos you add to a session you
                share, and photos you attach to a Space post. Before a photo for
                a post is uploaded, the app saves it again at a smaller size,
                which leaves out the location and other details your camera
                stored in the file.
              </li>
              <li>
                <strong className="text-foreground">
                  Run Map Images (optional):
                </strong>{" "}
                when you share a run with a route, the app draws a picture of
                the map of the route it shares (with the start and finish hidden
                unless you turned that off, and your privacy zones removed) and
                stores it with the post. It is checked as photos are (section 7)
                and deleted with the post.
              </li>
              <li>
                <strong className="text-foreground">
                  Segments (optional):
                </strong>{" "}
                a segment you make from a stretch of one of your runs (its line,
                name and length), and the times our server records when a run of
                yours passes along a segment, yours or someone else’s. See
                section 4.
              </li>
              <li>
                <strong className="text-foreground">
                  Social Activity (optional):
                </strong>{" "}
                the posts you share, comments, props, follows, Circle check-ins
                and meet-ups, Space posts, and the reports you make about
                content or accounts. Also the posts you hide from your feed, the
                people you block, the challenges you join with your progress and
                place in them, the medals they award, your weekly league
                standing if you join the league, a race you choose to show on
                your profile, and who invited you, if you joined from someone’s
                invite.
              </li>
              <li>
                <strong className="text-foreground">
                  Notifications in the app:
                </strong>{" "}
                the notices in your tray, such as “Sam gave you props”. One
                about something a person did carries their name, so when you
                give props, comment, follow or join from an invite, your name
                goes into the other person’s tray. Each notice is deleted after
                90 days, and when either account is deleted.
              </li>
              <li>
                <strong className="text-foreground">
                  Subscription Records:
                </strong>{" "}
                whether you have Pro, where you bought it, its product and
                dates, and the store’s transaction identifiers.
              </li>
              <li>
                <strong className="text-foreground">
                  Usage Data and Analytics Identifiers:
                </strong>{" "}
                which screens and features you use, and events such as finishing
                a workout, a run or a scan, tied to an identifier for this
                installation of the app. They carry no figure about your body,
                food or training. See section 2.
              </li>
              <li>
                <strong className="text-foreground">
                  Notification Token (optional):
                </strong>{" "}
                if you allow notifications, the token your phone or browser
                gives Tropos so that notifications reach that device, and
                whether it is an iPhone or a browser. Signing out on the device
                removes it from your account.
              </li>
              <li>
                <strong className="text-foreground">
                  Crash and Error Reports:
                </strong>{" "}
                error messages and where in the app they happened, with the
                address of the screen (any name or id in it taken out) and your
                device’s browser or app details, and in the iPhone app, its
                crashes.
              </li>
              <li>
                <strong className="text-foreground">
                  Preferences and Time Zone:
                </strong>{" "}
                units, theme, notification and sharing choices, and your
                device’s time zone, so daily limits and reminders follow your
                local day.
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
              section 1: which screens you open, what you do there (such as
              finishing a workout or tapping a chart), the choices you make in
              settings and in your plan, and timings, such as how long a screen
              took to appear or logging a meal took. It receives the choices you
              made in setup: your goal (such as building muscle or losing fat),
              how many days a week you train, whether you lift, run or both, and
              whether your runs follow a race plan, a starter plan or neither.
              Events from your food diary carry counts, such as how many rows a
              day shows, never what is in them. It receives no figure about your
              body, food, sleep, heart or training, such as a weight, calories,
              a distance, a pace or a score. Google also works out an
              approximate location, such as the country or city, from your
              connection. Analytics never receives your email address, your
              name, GPS routes, what you type about meals, the names of your
              foods, or your notes.
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
              upload, so they are not stored as plain image files: anyone
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
              Your display name, profile photo, streaks, badges and medals are
              visible to other signed-in Tropos users, and so is a race you
              choose to show on your profile. Anyone signed in can find you by
              searching for your name. Your profile also holds whether you set
              up Tropos to lift, run or both, when your account was made and the
              last day your streak counted. The app does not show those three to
              other people, but anyone signed in can read them. Your logs
              (meals, weight, workouts and runs) are private to your account
              unless you share them. Comments on a session you share are seen by
              whoever can see that session. Circle check-ins are seen by the
              people in that Circle, and a Circle meet-up (what it is, when, and
              the place you type) by the Circle’s members.{" "}
              <strong className="text-foreground">
                Spaces are open to everyone signed in:
              </strong>{" "}
              anyone signed in to Tropos can read a Space’s posts, the comments
              and props on them, and who has joined it (each member’s name and
              photo), whether or not they have joined it themselves. If you join
              a challenge, your name, photo and progress in it are visible to
              other signed-in Tropos users. If you join the weekly league, the
              people in your group (about 20) see your first name, your photo
              and your week: the sessions you did against those your plan had,
              and the points they give. Leaving the league removes your standing
              at once.
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
              <strong className="text-foreground">
                Public posts on the web.
              </strong>{" "}
              Anyone with the link to a session you shared publicly can open it
              on troposfit.com, signed in or not, and a search engine that finds
              the link may list it. That page shows your display name and
              profile photo, the session’s name and date, its figures (a run’s
              distance, time, pace and climb, or a workout’s time, volume,
              number of exercises and any record) and, for a run, a map of its
              route with the start and finish cut off and your privacy zones
              removed. A followers-only or private post never opens there.
            </p>
            <p>
              <strong className="text-foreground">Segments.</strong> A segment
              is a stretch of one of your runs that you name. Anyone signed in
              can open its line, name and length, and it does not name you. Each
              outdoor GPS run saved after a segment is made is checked against
              it on our server, so your runs are timed on segments other people
              made, and theirs on yours. When you make a segment, your own last
              50 runs are checked against it too. Each time is kept in the
              runner’s own account, where only they see it. Your best time on a
              segment is shown to your accepted followers, and only when it
              comes from a run you shared with followers or publicly and neither
              its start nor its end is in one of your privacy zones. Anyone else
              can report a segment, and Tropos can remove it. Deleting a run, a
              segment or your account deletes the times that go with it.
            </p>
            <p>
              <strong className="text-foreground">Followers.</strong> Someone
              becomes your follower once you accept their request, unless you
              turn off Approve followers in Settings &gt; Social &amp; privacy,
              when anyone can follow you. A request is seen only by you and the
              person who asked. Who you follow and who follows you are visible
              to other signed-in Tropos users.
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
              <li>
                Turn usage analytics off at any time, with Share usage analytics
                in Settings &gt; Social &amp; privacy
              </li>
              <li>
                Object to any other use of your data where we rely on legitimate
                interests (section 6), by writing to support@troposfit.com
              </li>
              <li>Complain, to us or to the ICO (section 6)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              6. GDPR Compliance
            </h2>
            <p>
              If you are located in the UK or European Economic Area, you have
              additional rights under the General Data Protection Regulation
              (GDPR).
            </p>
            <p>
              <strong className="text-foreground">Legal basis.</strong> The law
              allows us to use your data for each purpose on one of these
              grounds:
            </p>
            <table className="w-full text-left text-xs text-muted-foreground border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="py-1.5 pr-3 font-semibold text-foreground"
                  >
                    What we do
                  </th>
                  <th
                    scope="col"
                    className="py-1.5 font-semibold text-foreground"
                  >
                    Why the law allows it
                  </th>
                </tr>
              </thead>
              <tbody>
                {LEGAL_BASES.map(({ purpose, basis }) => (
                  <tr
                    key={purpose}
                    className="border-b border-border align-top"
                  >
                    <td className="py-1.5 pr-3">{purpose}</td>
                    <td className="py-1.5">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
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
                You can export your data in CSV format through the app’s
                settings.
              </li>
              <li>
                <strong className="text-foreground">Right to object:</strong>{" "}
                You can object to our use of your data where we rely on
                legitimate interests, and we will stop unless we have a strong
                reason to continue, such as keeping other people safe. For usage
                analytics, turn off Share usage analytics in Settings &gt;
                Social &amp; privacy, which stops it on iPhone and on the web.
              </li>
              <li>
                <strong className="text-foreground">
                  Right to withdraw consent:
                </strong>{" "}
                You can withdraw your consent to your health details by deleting
                your account, and withdraw it for AI food analysis by turning it
                off in Settings &gt; Social &amp; privacy.
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
                prevent purchase theft. If a moderator had restricted your
                account, we keep a coded form of its email address and its Apple
                or Google sign-in for 13 months, which can’t be read back, so
                that a new account made with them is restricted too. A record of
                a password-reset request holds a coded form of the email address
                a reset was asked for, never the address itself, and is kept for
                up to a day after the last request. When you open an invite link
                before you have an account, our server keeps a coded form of
                your connection’s IP address, never the address itself, for up
                to a day after the last lookup, so that invite codes can’t be
                looked up too often. Expired records are removed by scheduled
                retention policies; removal is not instantaneous. An outstanding
                subscription cancellation request is kept until it is resolved.
                Deletion also leaves the records of Apple’s subscription
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
                new meal photos are kept on your phone, not on our servers, and
                no process of ours can reach a phone. Deleting your account
                clears them from the device you delete from. If you have signed
                in on another device, that device keeps its copies until they
                expire after 90 days or you delete the app there. A meal photo
                that an earlier version of Tropos stored on our servers is
                deleted with your account (section 7).
              </li>
            </ul>
            <p>
              <strong className="text-foreground">Complaints.</strong> If you
              are unhappy with how we use your data, tell us at
              support@troposfit.com. We acknowledge a complaint no later than 30
              days after we receive it, look into it and tell you what we found.
              You can also complain to the Information Commissioner’s Office
              (ICO), the UK’s data protection regulator, at{" "}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline"
              >
                ico.org.uk
              </a>
              .
            </p>
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
                Cloud Storage (progress, profile, post and Space photos, the map
                images of runs you share, and meal photos stored by earlier
                versions of Tropos), Cloud Functions (our server code), App
                Check (which checks that requests come from the real app; on the
                web it uses reCAPTCHA), Firebase Cloud Messaging (which delivers
                notifications to your phone or browser), Google Analytics for
                Firebase (usage analytics, section 2) and, in the iPhone app,
                Firebase Crashlytics (crash reports, below).
              </li>
              <li>
                <strong className="text-foreground">
                  Photo checks (Google Cloud Vision):
                </strong>{" "}
                the photo you set as your profile photo, the photos you add to a
                session you share or attach to a Space post, and the map image
                of a run you share are checked by Google Cloud Vision’s
                SafeSearch before other people can see them, and one with nudity
                is deleted. Google processes the photo only to return the check
                and does not use it to train its models.
              </li>
              <li>
                <strong className="text-foreground">
                  AI Food Analysis (Google Gemini):
                </strong>{" "}
                if you allow it, the photo you take of a meal or a nutrition
                label, or a meal you type (Pro), is sent to Google’s Gemini on
                Vertex AI to estimate what is in it and its macros. Tropos asks
                before the first one is sent, and you can turn it off at any
                time in Settings &gt; Social &amp; privacy. Google processes it
                to return the estimate and may hold it briefly under its terms
                for this service, for example to detect abuse. Google does not
                use it to train its models.{" "}
                <strong className="text-foreground">
                  Tropos does not store new food photos on its servers.
                </strong>{" "}
                After analysis, the photo is kept only on the device that took
                it, so your meal diary can show it. It is not backed up to
                iCloud, does not sync between your devices, and is deleted
                automatically after 90 days, the furthest back the diary can be
                viewed. Deleting the app, or getting a new phone, removes these
                photos; your logged meals and their nutrition data are
                unaffected. Earlier versions of Tropos stored meal photos in
                Cloud Storage. A photo stored then is still there, where only
                your account can open it, until you delete your account;
                deleting the meal does not remove it. Barcode scans do not use
                AI: the barcode is read on your phone and looked up in Open Food
                Facts (below).
              </li>
              <li>
                <strong className="text-foreground">Apple:</strong> Sign in with
                Apple (if you use it), Apple Health (optional steps, sleep and
                heart for readiness and, when available, run heart rate and
                workout export; section 8), In-App Purchase (Pro bought in the
                app; Apple handles the payment), the Apple Push Notification
                service (notifications on your iPhone, through Firebase Cloud
                Messaging) and App Attest (which confirms that requests come
                from the real app on your iPhone).
              </li>
              <li>
                <strong className="text-foreground">RevenueCat:</strong> manages
                Pro subscriptions. It holds your Tropos account ID and your
                purchase history.
              </li>
              <li>
                <strong className="text-foreground">Stripe:</strong> payments
                for Pro bought on the web. Stripe handles the card details; we
                receive the subscription’s status and Stripe’s customer and
                subscription identifiers.
              </li>
              <li>
                <strong className="text-foreground">Resend:</strong> sends
                account emails, such as verifying your email address or
                resetting your password, and the reminder before a free trial
                turns into a paid subscription. It receives your email address
                and the email. It also carries the alert Tropos gets when
                someone makes a report: the reason, what kind of thing was
                reported and any note the person reporting wrote, which can
                quote what they reported.
              </li>
              <li>
                <strong className="text-foreground">Open Food Facts:</strong>{" "}
                barcode lookups and food searches. The barcode or the words you
                search for go straight from your phone, with its IP address; no
                account details are sent, and Tropos keeps none of your
                searches.
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
                  Route Planning (Mapbox, earlier builds):
                </strong>{" "}
                Road-aware planning is no longer offered. In earlier builds, the
                map points you tapped (or, for a generated loop, your chosen
                start point plus a handful of nearby points we compute from it
                and your chosen distance) were sent from our server to Mapbox’s
                Directions service to calculate a walking route. We sent only
                those coordinates, never your name, account details, saved
                routes, or run history, and did not separately log the request
                coordinates. When you chose Save &amp; follow, the returned
                route geometry was saved privately to your account.
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
              <strong className="text-foreground">Where your data goes.</strong>{" "}
              Tropos is run from the UK, and your data is also processed in the
              United States: our server code runs in Google Cloud’s us-central1
              region, Google’s Gemini on Vertex AI analyses meals in the US, and
              RevenueCat, Resend and Stripe are US companies. Google, Resend and
              Stripe are certified under the UK Extension to the EU-US Data
              Privacy Framework (the UK-US data bridge). For RevenueCat, the
              safeguard is the UK’s International Data Transfer Addendum to the
              EU standard contractual clauses, in its data processing terms.
              Write to support@troposfit.com for a copy of the safeguard that
              covers a transfer.
            </p>
            <p>
              <strong className="text-foreground">Error Reporting:</strong> We
              automatically collect crash reports and error logs to improve app
              stability. They are stored with your account, and in the iPhone
              app Google’s Firebase Crashlytics also receives them, with your
              account’s ID but not your name or email address. Reports include
              error messages and stack traces, the address of the screen the app
              was on with any name or id in it taken out (an exercise’s page is
              kept as /history/exercise/:id, never with the exercise’s name),
              and your device’s browser or app details (its user agent), but do
              not contain sensitive personal data such as passwords, meal
              content, or workout details.
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
              and never sold. None of it is sent to Google Analytics (section
              2).
            </p>
            <p>
              <strong className="text-foreground">Apple Health.</strong> If you
              connect steps, Tropos reads your daily step count on your phone.
              With Pro, it compares last week’s average with the activity level
              your calorie target assumes, and offers to change the level when
              they differ; nothing changes unless you accept, and then only the
              new activity level is saved. The step count is not stored or sent
              to Tropos. With Pro, if you add sleep and heart, Tropos reads your
              sleep, resting heart rate and heart rate variability for the last
              four weeks to say how ready you are for today’s session. They are
              read on your phone each time and are not stored or sent to Tropos.
              Apple Watch runs and workout export are not yet in the App Store
              version of Tropos; this is how they work when they are available.
              If you use Apple Watch runs, Tropos reads heart rate during that
              run to show a live reading and calculate a run summary. The Watch
              reads it through a workout session, and Apple asks an app that
              runs one for permission to save workouts as well; the Watch saves
              none. Raw heart rate samples are held on your device until you
              save or discard the run; a saved run can include average and
              maximum heart rate and time in heart rate zones. Those values are
              not used to change calorie targets or sent to product analytics.
              If you separately turn on workout export, Tropos writes a
              completed run to Apple Health after it is saved to your account.
              The exported workout contains its time, distance and estimated
              energy, without a GPS route. Tropos does not import Apple Health
              workouts into your training plan. You can change either choice in
              Tropos settings and remove Apple Health access in the Health app.
            </p>
            <p>
              <strong className="text-foreground">Heart rate sensor.</strong> If
              you pair a Bluetooth heart rate sensor, such as a chest strap or
              an armband, Tropos uses Bluetooth to read your heart rate from it
              during a run, to show a live reading, to tell you when an easy run
              goes above your easy zone, and to calculate a run summary. Raw
              readings are held on your device until you save or discard the
              run, and the sensor’s name is kept on this iPhone to reconnect to
              it. A saved run can include average and maximum heart rate and
              time in heart rate zones, as with Apple Watch runs, and those
              values are not used to change calorie targets or sent to product
              analytics. You can forget the sensor in Settings &gt; Run plan.
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
              9. Children’s Privacy
            </h2>
            <p>
              Tropos is not intended for anyone under 18. We do not knowingly
              collect data from anyone under 18.
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
              For questions about this privacy policy or your data, contact us
              at support@troposfit.com
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
