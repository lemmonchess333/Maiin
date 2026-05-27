import { Link } from "react-router-dom";
import { Scale, Mail, Shield, ChevronRight, Flag } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";

declare const __APP_VERSION__: string;

// `support@troposfit.com` is a Cloudflare Email Routing forwarder — no
// mailbox lives at troposfit.com itself. Inbound mail forwards to
// troposfit@gmail.com, a dedicated support inbox separate from the
// owner's personal Gmail. The Privacy Policy, Terms of Service, and
// privacy.html also reference this address (see PrivacyPolicy.tsx,
// TermsOfService.tsx, privacy.html) so any change to the routing target
// or the support address itself needs to touch all four.
//
// The original address was support@troposfit.com — a domain nobody
// here owned. Swapped to support@troposfit.com once the troposfit.com
// domain was registered and the Cloudflare route verified.

// Pre-filled mailto body gives support a baseline diagnostic snapshot on
// every ticket without asking the user to type it. App version, user
// agent, and a short bug-report scaffold arrive in the same inbox slot as
// the complaint, which roughly halves back-and-forth before a fix.
function buildSupportMailto(): string {
  const version =
    typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const body = [
    "Describe what you were doing and what went wrong:",
    "",
    "",
    "---",
    `App version: ${version}`,
    `Device: ${ua}`,
  ].join("\n");
  const subject = `Tropos support — v${version}`;
  return `mailto:support@troposfit.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Moderation contact — App Store Guideline 1.2 requires a
// published email for reports of objectionable user-generated
// content. Same `support@troposfit.com` Cloudflare forwarder; the
// subject prefix lets the inbox sort moderation tickets from
// general support tickets without a separate alias.
function buildModerationMailto(): string {
  const version =
    typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  const body = [
    "Describe the content you're reporting and where you saw it:",
    "",
    "",
    "---",
    `App version: ${version}`,
  ].join("\n");
  const subject = `Tropos moderation report — v${version}`;
  return `mailto:support@troposfit.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

interface SupportLegalSectionProps {
  inline?: boolean;
}

export default function SupportLegalSection({
  inline = false,
}: SupportLegalSectionProps = {}) {
  return (
    <AccordionSection
      inline={inline}
      icon={<Scale className="size-5 text-primary" />}
      title="Support & Legal"
      subtitle="Help, privacy policy, terms"
    >
      <a
        href={buildSupportMailto()}
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Mail className="size-5" />
          <div>
            <p className="text-sm text-foreground">Help & Support</p>
            <p className="text-xs text-muted-foreground">
              support@troposfit.com
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </a>

      <a
        href={buildModerationMailto()}
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Flag className="size-5" />
          <div>
            <p className="text-sm text-foreground">
              Report objectionable content
            </p>
            <p className="text-xs text-muted-foreground">
              support@troposfit.com
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </a>

      <Link
        to="/privacy"
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Shield className="size-5" />
          <span className="text-sm text-foreground">Privacy Policy</span>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <Link
        to="/terms"
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Shield className="size-5" />
          <span className="text-sm text-foreground">Terms of Service</span>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </AccordionSection>
  );
}
