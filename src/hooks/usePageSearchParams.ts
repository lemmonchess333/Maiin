import { useCallback, useContext } from "react";
import {
  UNSAFE_NavigationContext,
  useHref,
  useLocation,
  useSearchParams,
  type SetURLSearchParams,
} from "react-router-dom";

/**
 * `useSearchParams` for a page that keeps its own state in the URL
 * (Train's ?day= and ?tab=), whose writes stop once the person has left.
 *
 * A write navigates to this page's path with the new query. Navigations
 * run in a transition, so the page stays mounted while the next one
 * loads, and an effect of its that wrote then (a plan arriving, a week
 * rolling over) took the person back: a tap on Home from Train landed on
 * Train again. The router's history has moved on by then; a write is
 * dropped when that history no longer names this page.
 */
export function usePageSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const { pathname } = useLocation();
  // The history holds the basename (/Maiin/); the router's location does not.
  const href = useHref(pathname);
  const setOnPage = useCallback<SetURLSearchParams>(
    (next, options) => {
      const current = (navigator as { location?: { pathname: string } })
        .location?.pathname;
      if (current !== undefined && current !== href) return;
      setSearchParams(next, options);
    },
    [navigator, href, setSearchParams]
  );
  return [searchParams, setOnPage];
}
