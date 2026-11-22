/**
 * `/activity/:activityId` for a signed-out visitor: one shared post,
 * where the link in a shared card's words lands (App1, Q50 and Q51).
 *
 * In the owner's layout of 22 Nov 2026 (`SharedLanding`, as a shared
 * card's page): the small lockup, "Sam shared a run" (the author's first
 * name), the post's card, drawn by the share card's own renderer
 * (ShareCardRenderer), then one button, "Join Tropos", to the App Store,
 * and a line about Tropos. Never with the author's invite code: a post's
 * address is fixed and public, and a code on it would reach a person the
 * author blocked (Soc15 STATUS lines). The route ends here: no props, no
 * comments, no
 * profile and no nav. A signed-in visitor at the same address gets the
 * post in the app (ActivityPost.tsx), and on a phone with Tropos the
 * address opens the app.
 *
 * Only a public post is shown. A followers-only or private post, one that
 * is gone, or one by an account that is restricted or deleted all get one
 * page, "This post isn’t available", which never says why: the server
 * answers them alike (functions/lib/publicPost.js).
 *
 * A run's map sits under the card (the owner, 14 November 2026: its start
 * and finish cut off, as Strava does, so a stranger can't see where
 * someone lives). The server cuts the line before it is sent
 * (functions/lib/publicRoute.js); a run with too little left, and every
 * treadmill, manual or lift post, comes with no route and gets no map.
 * The map is the app's own (RunMap: MapLibre on OpenFreeMap's tiles, the
 * tiles' credit in its corner), still and without its start and finish
 * dots, fetched once there is a route to draw so the card paints without
 * waiting for it. A browser that cannot draw it shows the card alone.
 *
 * Signed-out screens are dark and sit on the plain page in one phone-wide
 * column under the lockup, as the welcome and sign-in do (DESIGN_GUIDE
 * §14p); `.ds-auth-shell` pads the page by `--safe-top` and
 * `--safe-bottom`. The card is the hero, at most 60% of the screen's
 * height; the button is the brand's filled one, as Get started is.
 */
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import {
  SharedCardFrame,
  SharedLanding,
} from "@/components/share/SharedLanding";
import { Button } from "@/components/ui/Button";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import type { GPSPoint } from "@/lib/gps";
import { lazyRetry } from "@/lib/lazyRetry";
import { logger } from "@/lib/logger";
import { sharedLine } from "@/lib/joinTropos";
import { APP_STORE_URL } from "@/lib/publicLinks";
import {
  loadPublicPost,
  publicPostCard,
  type PublicPostView,
} from "@/lib/publicPost";
import type { RouteCoordinate } from "@/lib/routeSegments";

/* The map's code (MapLibre) is fetched only for a post with a route, after
   the card has painted. A failed fetch leaves the card alone: a reload
   would not bring a map a browser cannot draw. */
const RunMap = lazyRetry(() => import("@/components/run/RunMap"), {
  reloadOnChunkError: false,
});

type Read =
  | { status: "loading" }
  | { status: "ready"; post: PublicPostView }
  | { status: "unavailable" }
  | { status: "error" };

export default function PublicPost() {
  const { activityId = "" } = useParams<{ activityId: string }>();
  // Keyed, so another post's address starts from loading.
  return <PublicPostPage key={activityId} activityId={activityId} />;
}

function PublicPostPage({ activityId }: { activityId: string }) {
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadPublicPost(activityId)
      .then((post) => {
        if (!live) return;
        setRead(post ? { status: "ready", post } : { status: "unavailable" });
      })
      .catch((err: unknown) => {
        logger.warn("[public-post] read failed", err);
        if (live) setRead({ status: "error" });
      });
    return () => {
      live = false;
    };
  }, [activityId, attempt]);

  if (read.status === "ready") {
    const { post } = read;
    return (
      <SharedLanding
        line={sharedLine(post.firstName, post.type === "run" ? "run" : "lift")}
        href={APP_STORE_URL}
      >
        <SharedCardFrame data={publicPostCard(post)} label={post.summary} />
        {post.route && <RouteMap route={post.route} />}
      </SharedLanding>
    );
  }
  if (read.status === "unavailable") {
    return (
      <SharedLanding title="This post isn’t available" href={APP_STORE_URL} />
    );
  }
  if (read.status === "error") {
    return (
      <SharedLanding title="Couldn’t load this post" href={APP_STORE_URL}>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setRead({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </SharedLanding>
    );
  }
  return (
    <SharedLanding href={APP_STORE_URL}>
      <div
        role="status"
        aria-label="Loading post"
        className="aspect-square w-full rounded-2xl bg-muted motion-safe:animate-pulse"
      />
    </SharedLanding>
  );
}

/** The map gives way to nothing when it cannot be drawn (no WebGL, the
 *  chunk failed): the card above it says the run. */
class MapGivesWay extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    logger.warn("[public-post] map not drawn", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The route as the map draws a finished one. It has no times, as a
 *  planned route has none (savedRoutes' `coordsToPoints`). */
function mapPoints(route: RouteCoordinate[]): GPSPoint[] {
  return route.map((p) => ({
    ...(p.breakBefore ? { breakBefore: true } : {}),
    lat: p.lat,
    lon: p.lon,
    altitude: null,
    accuracy: 0,
    speed: null,
    timestamp: 0,
    rawLat: p.lat,
    rawLon: p.lon,
  }));
}

/**
 * The run's map, under the card: the line the server sent, which is the
 * route less its start and finish, on the basemap in the page's theme.
 * Still (no pan or zoom) and with no dots at its ends, which are not
 * where the run began or finished; the caption says so.
 */
function RouteMap({ route }: { route: RouteCoordinate[] }) {
  const dark = useIsDarkTheme();
  const points = useMemo(() => mapPoints(route), [route]);
  return (
    <MapGivesWay>
      <figure>
        {/* Sized from the column's width, as the card is, not the text. */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl card-shadow">
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="h-full w-full bg-muted motion-safe:animate-pulse" />
              }
            >
              <RunMap
                points={points}
                currentPoint={null}
                interactive={false}
                height="h-full"
                darkMode={dark}
                endMarkers={false}
              />
            </Suspense>
          </div>
        </div>
        <figcaption className="mt-2 text-xs text-muted-foreground">
          Start and finish hidden
        </figcaption>
      </figure>
    </MapGivesWay>
  );
}
