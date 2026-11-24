import { Mail } from "lucide-react";
import { Link } from "react-router-dom";
import LegalBack from "@/components/legal/LegalBack";

declare const __APP_VERSION__: string;

/**
 * Public support page (account table-stakes pass, 2026-07). Two jobs:
 *  - The Support URL App Store Connect requires — a mailto alone doesn't
 *    qualify; this page lives at <hosting-origin>/support.
 *  - A pre-sign-in support surface (the Settings support row only exists
 *    for signed-in users; a locked-out user needs a public path).
 * Static, no auth, mirrors the PrivacyPolicy/TermsOfService shell.
 */
export default function Support() {
  const version =
    typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  const mailto = `mailto:support@troposfit.com?subject=${encodeURIComponent(
    `Tropos support, v${version}`
  )}`;

  return (
    <main className="min-h-screen bg-background pt-[var(--safe-top)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <LegalBack />

        <div>
          <h1 className="text-xl font-extrabold text-foreground">Support</h1>
          <p className="text-xs text-muted-foreground mt-1">
            We usually reply within a couple of days.
          </p>
        </div>

        <div className="space-y-5 text-sm text-foreground/80 leading-relaxed">
          <section className="space-y-3">
            <p>
              Something broken, confusing, or missing? Email us and we’ll get
              you sorted.
            </p>
            <a
              href={mailto}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary-strong text-primary-foreground text-sm font-semibold hover:opacity-90 transition active:scale-[0.97]"
            >
              <Mail className="size-4" aria-hidden="true" />
              Email support@troposfit.com
            </a>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              Help us help you
            </h2>
            <p>Including these makes most issues a one-reply fix:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>What you were doing when it happened</li>
              <li>What you expected vs. what you saw (screenshots help)</li>
              <li>Your iPhone model and its iOS version</li>
              <li>The email address on your Tropos account</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              Sign-in problems
            </h2>
            <p>
              Can’t get into your account? Use{" "}
              <span className="text-foreground font-medium">
                Forgot password
              </span>{" "}
              on the sign-in screen. It works for Google and Apple accounts too:
              it emails you a link that sets a password. Still stuck? Email us
              from the address on your account.
            </p>
          </section>

          <section className="space-y-1 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>{" "}
              ·{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>
            </p>
            <p className="text-xs text-muted-foreground font-mono tabular-nums">
              App version {version}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
