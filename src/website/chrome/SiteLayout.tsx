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
  ownMain = false,
}: {
  children: ReactNode;
  overPhoto?: boolean;
  /** The page draws its own <main> (the app's legal pages do), so the
   *  layout's is a plain box: a page has one main landmark. */
  ownMain?: boolean;
}) {
  const Main = ownMain ? "div" : "main";
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader overPhoto={overPhoto} />
      <Main
        id={ownMain ? undefined : "main"}
        className="flex-1 overflow-x-clip"
      >
        {children}
      </Main>
      <SiteFooter />
    </div>
  );
}
