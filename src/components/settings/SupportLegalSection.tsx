import { Link } from "react-router-dom";
import { Scale, Mail, Shield, ChevronRight, Flag, Compass } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";

declare const __APP_VERSION__: string;

// `support@troposfit.com` is a Cloudflare Email Routing forwarder — no
// mailbox lives at troposfit.com itself. Inbound mail forwards to
// troposfit@gmail.com, a dedicated support inbox separate from the
// owner's personal Gmail. PrivacyPolicy.tsx, TermsOfService.tsx,
// Support.tsx and the static public/legal/*.html pages carry the same
// address, so a change to the routing target or the address itself has
// to touch every one of them (legalCopyClaims.test.ts pins the set).
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

/* At larger text the address wraps inside its column rather than pushing
   the row past the screen (it has no break of its own), and under 11em
   of row (double text, where a row is 8em to 10.3em) the icon gives its
   room to the words, as SettingsRow's does: beside it "objectionable"
   no longer fit. At 1.35x a row is 12.8em or more and keeps it. */
const ROW =
  "@container flex items-center justify-between gap-3 p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors";
const ICON = "size-5 shrink-0 @max-[11em]:hidden";

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
      title="Support & legal"
      subtitle="Help, privacy policy, terms"
    >
      {/* The first-visit walk again (FV1): Home reads the request from the
          router state, plays it, then clears it. */}
      <Link to="/" state={{ guide: "walk" }} className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Compass className={ICON} />
          <div className="min-w-0">
            <p className="text-sm text-foreground break-words hyphens-auto">
              Show me around
            </p>
            <p className="text-xs text-muted-foreground">
              A short walk through Home
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <a href={buildSupportMailto()} className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Mail className={ICON} />
          <div className="min-w-0">
            <p className="text-sm text-foreground break-words hyphens-auto">
              Help & support
            </p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              support@troposfit.com
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </a>

      <a href={buildModerationMailto()} className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Flag className={ICON} />
          <div className="min-w-0">
            <p className="text-sm text-foreground break-words hyphens-auto">
              Report objectionable content
            </p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              support@troposfit.com
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </a>

      <Link to="/privacy" className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Shield className={ICON} />
          <span className="text-sm text-foreground">Privacy Policy</span>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <Link to="/terms" className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Shield className={ICON} />
          <span className="text-sm text-foreground">Terms of Service</span>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </AccordionSection>
  );
}
