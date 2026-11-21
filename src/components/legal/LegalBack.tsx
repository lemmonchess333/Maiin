import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const CLASSES =
  "inline-flex items-center gap-2 min-h-[44px] -my-2 text-sm text-muted-foreground hover:text-foreground transition active:scale-[0.97]";

/**
 * The legal and support pages' Back. Someone who opened the page from the
 * App Store listing or a link has nothing behind it in this tab, so Back
 * goes to the front page ("/": the welcome in the app, the App Store page
 * on troposfit.com); otherwise it goes back. React Router names the first
 * entry it saw "default".
 *
 * `data-legal-back` marks it for the static copies, which leave it out
 * (scripts/legal-pages/staticPage.ts).
 */
export default function LegalBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  if (key === "default") {
    return (
      <Link to="/" data-legal-back="" className={CLASSES}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-legal-back=""
      onClick={() => navigate(-1)}
      className={CLASSES}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back
    </button>
  );
}
