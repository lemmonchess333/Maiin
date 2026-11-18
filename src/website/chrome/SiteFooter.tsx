import { Link } from "react-router-dom";
import BrandMark from "@/components/ui/BrandMark";
import { APPLE_CREDIT } from "@/website/AppStoreBadge";

const COLUMNS = [
  {
    heading: "The app",
    links: [
      { to: "/lifting", label: "Lifting" },
      { to: "/running", label: "Running" },
      { to: "/food", label: "Food" },
      { to: "/social", label: "Social" },
      { to: "/pro", label: "Tropos Pro" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/press", label: "Press kit" },
      { to: "/support", label: "Support" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/terms", label: "Terms of Service" },
    ],
  },
] as const;

/**
 * Every page's foot: the lockup and one line on what Tropos is, the
 * pages in three columns, and Apple's credit for its badge, given once
 * where the site gives its legal notices (App Store Marketing
 * Guidelines). The badge itself is not here: one per page, under the
 * page's own message.
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-stage text-stage-foreground">
      <div className="site-container py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 md:col-span-1 space-y-3">
            <p className="flex items-center gap-2.5">
              <BrandMark className="h-[22px]" />
              <span className="ds-wordmark text-[20px]">Tropos</span>
            </p>
            <p className="text-sm text-stage-muted max-w-[18rem]">
              Lifting, running and food, planned together. An iPhone app.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-sm font-semibold">{column.heading}</h2>
              <ul className="mt-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="inline-flex items-center min-h-[44px] text-sm text-stage-muted hover:text-stage-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-white/10 space-y-2 text-xs text-stage-muted">
          <p>© 2026 Tropos</p>
          <p>{APPLE_CREDIT}</p>
        </div>
      </div>
    </footer>
  );
}
