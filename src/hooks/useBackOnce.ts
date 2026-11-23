import { useCallback, useContext, useRef } from "react";
import {
  UNSAFE_NavigationContext,
  useHref,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { goBackOr } from "@/lib/backNavigation";

/**
 * Back from a page to where it was opened (`goBackOr`), once.
 *
 * A session's page goes back when an action on it lands, as a sheet
 * closed, and by its "← Train". Two of those (a second tap, or Back while
 * a command is on its way) went back twice, past Train. So the first one
 * goes, and any after it do nothing, nor does one that arrives once the
 * person has already left this page, as `usePageSearchParams` checks: the
 * router's history no longer names it.
 */
export function useBackOnce(fallback: string): () => void {
  const navigate = useNavigate();
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const { pathname } = useLocation();
  // The history holds the basename (/Maiin/); the router's location does not.
  const href = useHref(pathname);
  const gone = useRef(false);
  return useCallback(() => {
    if (gone.current) return;
    const current = (navigator as { location?: { pathname: string } }).location
      ?.pathname;
    if (current !== undefined && current !== href) return;
    gone.current = true;
    goBackOr(navigate, fallback);
  }, [navigator, href, navigate, fallback]);
}
