import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import BrandMark from "@/components/ui/BrandMark";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { cn } from "@/lib/utils";
import { HEADER_PAGES } from "@/website/headerPages";

/**
 * troposfit.com's header: the lockup (DS8 call 3, the mark beside the
 * name), the five product pages and the way to the App Store. Below
 * 768px the pages fold into a menu, a <details> so it opens before any
 * script has loaded; it closes when the page changes.
 *
 * `overPhoto` lays it over Home's photographs in the stage's fixed light
 * colours.
 */
export default function SiteHeader({
  overPhoto = false,
}: {
  overPhoto?: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <header className="site-header" data-over-photo={overPhoto}>
      <div className="site-container site-header-row">
        <Link
          to="/"
          className="flex items-center gap-2.5 min-h-[44px] rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
        >
          <BrandMark className="h-[26px]" />
          <span className="ds-wordmark">Tropos</span>
        </Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          {HEADER_PAGES.map((page) => (
            <NavLink key={page.to} to={page.to} className="site-nav-link">
              {page.label}
            </NavLink>
          ))}
        </nav>
        <a
          href={APP_STORE_URL}
          className={cn(
            "hidden md:inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-semibold",
            "bg-stage-foreground text-stage hover:opacity-90 transition-opacity",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          )}
        >
          Get the app
        </a>
        <details ref={menu} className="site-menu md:hidden">
          <summary
            aria-label="Menu"
            className="inline-flex items-center justify-center size-11 rounded-xl hover:bg-white/10 transition-colors"
          >
            <Menu className="size-6" aria-hidden="true" />
          </summary>
          <nav aria-label="Main" className="site-menu-panel">
            <ul>
              {HEADER_PAGES.map((page) => (
                <li key={page.to}>
                  <NavLink
                    to={page.to}
                    className="flex items-center min-h-[48px] px-4 rounded-xl text-base font-semibold hover:bg-white/5 aria-[current=page]:bg-white/10"
                  >
                    {page.label}
                  </NavLink>
                </li>
              ))}
              <li className="mt-2 pt-2 border-t border-white/10">
                <a
                  href={APP_STORE_URL}
                  className="flex items-center min-h-[48px] px-4 rounded-xl text-base font-semibold hover:bg-white/5"
                >
                  Get the app on the App Store
                </a>
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
