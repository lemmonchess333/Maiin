import type { ReactNode } from "react";
import SiteFooter from "@/website/chrome/SiteFooter";
import SiteHeader from "@/website/chrome/SiteHeader";

/**
 * A page of troposfit.com: the header, the page, the footer. Home lays
 * its header over its photographs (`overPhoto`); every other page has it
 * on the page.
 */
export default function SiteLayout({
  children,
  overPhoto = false,
}: {
  children: ReactNode;
  overPhoto?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader overPhoto={overPhoto} />
      <main id="main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
