import { Link } from "react-router-dom";
import {
  Scale,
  Mail,
  Shield,
  ChevronRight,
} from "lucide-react";
import AccordionSection from "@/components/AccordionSection";

declare const __APP_VERSION__: string;

// Pre-filled mailto body gives support a baseline diagnostic snapshot on
// every ticket without asking the user to type it. App version, user
// agent, and a short bug-report scaffold arrive in the same inbox slot as
// the complaint, which roughly halves back-and-forth before a fix.
function buildSupportMailto(): string {
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
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
  return `mailto:support@tropos.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function SupportLegalSection() {
  return (
    <AccordionSection icon={<Scale className="w-5 h-5 text-primary" />} title="Support & Legal" subtitle="Help, privacy policy, terms">
      <a
        href={buildSupportMailto()}
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5" />
          <div>
            <p className="text-sm text-foreground">Help & Support</p>
            <p className="text-xs text-muted-foreground">support@tropos.app</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </a>

      <Link
        to="/privacy"
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" />
          <span className="text-sm text-foreground">Privacy Policy</span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>

      <Link
        to="/terms"
        className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" />
          <span className="text-sm text-foreground">Terms of Service</span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>
    </AccordionSection>
  );
}
