import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div>
          <h1 className="text-xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: February 2026
          </p>
        </div>

        <div className="space-y-5 text-sm text-foreground/80 leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              1. Information We Collect
            </h2>
            <p>
              Adaptive Fitness collects the following information when you
              create an account and use the app:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Account Information:</strong>{" "}
                Email address and display name
              </li>
              <li>
                <strong className="text-foreground">Body Metrics:</strong> Weight
                and height for personalized tracking
              </li>
              <li>
                <strong className="text-foreground">Activity Data:</strong>{" "}
                Workout logs, meal counts, personal records, and notes
              </li>
              <li>
                <strong className="text-foreground">Preferences:</strong> Unit
                preferences, theme settings, and fitness goals
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
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Data Sharing
            </h2>
            <p>
              We do <strong>not</strong> sell, rent, or share your personal data
              with third parties. Your fitness data is private and only
              accessible to you.
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
                Delete your account and all associated data by contacting us
              </li>
              <li>Export your data in a standard format</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              6. Third-Party Services
            </h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Firebase (Google):</strong>{" "}
                Authentication and data storage
              </li>
            </ul>
            <p>
              These services have their own privacy policies governing data
              handling.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              7. Children's Privacy
            </h2>
            <p>
              Adaptive Fitness is not intended for children under 13. We do not
              knowingly collect data from children under 13.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              8. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. We will
              notify you of significant changes through the app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              9. Contact
            </h2>
            <p>
              For questions about this privacy policy or your data, please
              contact us through the app settings or at our support channels.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
