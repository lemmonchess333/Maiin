import type { ReactNode } from "react";
import SiteFooter from "@/website/site/SiteFooter";
import SiteHeader from "@/website/site/SiteHeader";

/**
 * Every page of troposfit.com: the header, the page and the footer, with
 * a link past the header for a keyboard. `current` is the page's address,
 * marked in the header; `overPhoto` lays the header over the home page's
 * photographs on a phone. `ownMain` is for a page that is its own
 * `<main>` (the app's legal and support pages), so there is one.
 */
export default function SiteLayout({
  current,
  overPhoto = false,
  ownMain = false,
  children,
}: {
  current?: string;
  overPhoto?: boolean;
  ownMain?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-background"
      >
        Skip to content
      </a>
      <SiteHeader current={current} overPhoto={overPhoto} />
      {ownMain ? (
        // Focusable, so Safari moves focus here with the skip link.
        <div id="main" tabIndex={-1}>
          {children}
        </div>
      ) : (
        <main id="main">{children}</main>
      )}
      <SiteFooter />
    </div>
  );
}
