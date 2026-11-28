import { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { landingContext, type LandingContext } from "@/website/websiteAddress";

const NO_CONTEXT: LandingContext = { invite: null, note: null };
const subscribeToNothing = () => () => {};

/**
 * What the address that brought the visitor adds to a page: a friend's
 * invite or a shared Space on Home, the checkout's return on Pro
 * (`websiteAddress.ts`). Nothing while the browser takes over the HTML it
 * was sent (written out at build time, which knows no address), then the
 * address's own: `useSyncExternalStore`'s server snapshot is what
 * hydration reads.
 */
export function useLandingContext(): LandingContext {
  const { pathname, search } = useLocation();
  const inBrowser = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  return inBrowser ? landingContext(pathname, search) : NO_CONTEXT;
}
