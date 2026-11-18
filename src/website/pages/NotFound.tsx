import { Link } from "react-router-dom";
import HeroPhotos from "@/website/blocks/HeroPhotos";
import AppStoreBadge from "@/website/AppStoreBadge";
import SiteLayout from "@/website/chrome/SiteLayout";
import { HEADER_PAGES } from "@/website/headerPages";
import { NOT_FOUND_TITLE } from "@/website/sitePages";
import { usePageHead } from "@/website/usePageHead";

/**
 * The 404: an address that is neither a page of the website nor one the
 * app handed out (`websiteRoute`). It stands on the welcome's
 * photographs, as Home does. Hosting serves it as 404.html with a 404
 * status (scripts/website/prerender.ts writes it), and it asks search
 * engines not to keep it, in its HTML and when the browser moves to it.
 */
export default function NotFound() {
  usePageHead({ title: NOT_FOUND_TITLE, noindex: true });
  return (
    <SiteLayout overPhoto>
      <section className="home-hero" aria-labelledby="not-found-title">
        <HeroPhotos />
        <div className="site-container home-hero-copy">
          <div className="max-w-[36rem] space-y-3">
            <p className="site-kicker text-stage-muted">Page not found</p>
            <h1 id="not-found-title" className="site-h1">
              There’s no page at this address
            </h1>
            <p className="site-lede text-stage-foreground/85">
              The link may be old or mistyped. Tropos is an iPhone app, and this
              site says what it does.
            </p>
            <nav aria-label="Pages">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link
                    to="/"
                    className="inline-flex items-center min-h-[44px] px-4 rounded-full bg-white/12 text-sm font-semibold hover:bg-white/20"
                  >
                    Home
                  </Link>
                </li>
                {HEADER_PAGES.map((page) => (
                  <li key={page.to}>
                    <Link
                      to={page.to}
                      className="inline-flex items-center min-h-[44px] px-4 rounded-full bg-white/12 text-sm font-semibold hover:bg-white/20"
                    >
                      {page.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <AppStoreBadge />
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
