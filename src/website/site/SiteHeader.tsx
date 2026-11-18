import { Menu, X } from "lucide-react";
import AuthLockup from "@/components/auth/AuthLockup";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { cn } from "@/lib/utils";
import { SITE_NAV } from "@/website/site/pages";

/** The menu's further rows on a phone, which the footer carries on a
 *  wide window. */
const MORE_NAV: readonly { href: string; label: string }[] = [
  { href: "/about", label: "About" },
  { href: "/press", label: "Press kit" },
  { href: "/support", label: "Support" },
];

/**
 * The website's header: the lockup (DS8 call 3), the five sections, and a
 * link to the App Store that is not Apple's badge, which a page shows
 * once (AppStoreBadge). Plain links: each page is its own file, so there
 * is no script to route with. On a phone the sections fold into a menu,
 * a disclosure that opens without script.
 *
 * `overPhoto` is the home page's: on a phone the header lies clear over
 * the photographs, as the welcome's lockup does.
 */
export default function SiteHeader({
  current,
  overPhoto = false,
}: {
  current?: string;
  overPhoto?: boolean;
}) {
  return (
    <header
      className="site-header"
      data-over-photo={overPhoto ? "true" : undefined}
    >
      <div className="mx-auto flex h-16 max-w-[70rem] items-center gap-3 px-4 lg:px-8">
        <a
          href="/"
          aria-label="Tropos home"
          className="-ml-1 inline-flex min-h-[44px] items-center rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <AuthLockup className="text-stage-foreground" />
        </a>
        <nav aria-label="Sections" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={current === item.href ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                    current === item.href
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={APP_STORE_URL}
            className={buttonClasses({
              variant: "neutral",
              size: "md",
              // At 320 px the lockup, this and the menu do not fit a row;
              // the menu's rows and the page's badge are the way there.
              className: "hidden rounded-full px-4 min-[360px]:inline-flex",
            })}
          >
            Get the app
          </a>
          <details className="site-menu lg:hidden">
            <summary
              aria-label="Menu"
              className="inline-flex size-11 items-center justify-center rounded-full text-stage-foreground hover:bg-white/10"
            >
              <Menu className="site-menu-open size-5" aria-hidden="true" />
              <X className="site-menu-close size-5" aria-hidden="true" />
            </summary>
            <nav
              aria-label="Menu"
              className="absolute inset-x-0 top-16 border-b border-white/10 bg-background px-4 pb-4"
            >
              <ul>
                {[...SITE_NAV, ...MORE_NAV].map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={current === item.href ? "page" : undefined}
                      className="flex min-h-[52px] items-center border-b border-white/5 text-base font-semibold text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
