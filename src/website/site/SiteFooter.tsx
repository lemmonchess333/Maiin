import AuthLockup from "@/components/auth/AuthLockup";
import { APPLE_CREDIT } from "@/website/AppStoreBadge";
import { SITE_NAV } from "@/website/site/pages";

const COLUMNS: readonly {
  heading: string;
  links: readonly { href: string; label: string }[];
}[] = [
  { heading: "Tropos", links: SITE_NAV },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/press", label: "Press kit" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

/**
 * The website's footer: every page, the legal pages the App Store listing
 * names, who runs Tropos (as the Privacy Policy says it), and the credit
 * Apple asks for wherever its badge is used.
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-background">
      <div className="mx-auto max-w-[70rem] px-4 py-12 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 max-w-xs lg:col-span-1">
            <AuthLockup className="text-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Lifting, running and food, planned together. An iPhone app.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {column.heading}
              </h2>
              <ul className="mt-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="inline-flex min-h-[44px] items-center text-sm text-foreground/85 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 space-y-2 border-t border-white/[0.06] pt-6 text-xs text-muted-foreground">
          <p>Tropos is run by Myles Kennedy, trading as Tropos.</p>
          <p>{APPLE_CREDIT}</p>
        </div>
      </div>
    </footer>
  );
}
