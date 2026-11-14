/**
 * `/activity/:activityId` for a signed-out visitor: one shared post,
 * where the link in a shared card's words lands (App1, Q50 and Q51).
 *
 * The post's card, drawn by the share card's own renderer
 * (ShareCardRenderer), under who shared it, then one way on: Get Tropos,
 * to the App Store. The route ends here: no props, no comments, no
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
 * `--safe-bottom`. The card is the hero; Get Tropos is the brand's filled
 * button, as Get started is.
 */
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import AuthLockup from "@/components/auth/AuthLockup";
import Avatar from "@/components/Avatar";
import ShareCardRenderer from "@/components/share/ShareCardRenderer";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import type { GPSPoint } from "@/lib/gps";
import { lazyRetry } from "@/lib/lazyRetry";
import { logger } from "@/lib/logger";
import { APP_STORE_URL } from "@/lib/publicLinks";
import {
  loadPublicPost,
  publicPostCard,
  type PublicPostView,
} from "@/lib/publicPost";
import type { RouteCoordinate } from "@/lib/routeSegments";
import { formatDayMonthYear } from "@/utils/formatters";

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

/** The card's drawn size (ShareCardRenderer's square). */
const CARD_PX = 1080;

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

  return (
    <div className="ds-auth-shell">
      <main className="ds-auth-page ds-page-stack">
        <AuthLockup />
        {read.status === "ready" ? (
          <>
            <PostHeader post={read.post} />
            <PostCard post={read.post} />
            {read.post.route && <RouteMap route={read.post.route} />}
            <AboutTropos />
          </>
        ) : read.status === "unavailable" ? (
          <>
            <h1 className="text-h2 font-extrabold leading-[1.12] tracking-tight text-foreground text-balance">
              This post isn’t available
            </h1>
            <AboutTropos />
          </>
        ) : read.status === "error" ? (
          <>
            <div>
              <h1 className="text-h2 font-extrabold leading-[1.12] tracking-tight text-foreground text-balance">
                Couldn’t load this post
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Check your connection and try again.
              </p>
            </div>
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
          </>
        ) : (
          <div
            role="status"
            aria-label="Loading post"
            className="aspect-square w-full rounded-2xl bg-muted animate-pulse"
          />
        )}
        <a
          href={APP_STORE_URL}
          className={buttonClasses({ fullWidth: true, size: "md" })}
        >
          Get Tropos
        </a>
      </main>
    </div>
  );
}

/** Who shared it, and when. */
function PostHeader({ post }: { post: PublicPostView }) {
  return (
    <header className="flex items-center gap-3 min-w-0">
      <Avatar
        photoURL={post.authorPhotoURL}
        displayName={post.authorName}
        size="lg"
      />
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-foreground break-words">
          {`${post.authorName}’s ${post.type === "run" ? "run" : "workout"}`}
        </h1>
        {post.createdAt !== undefined && (
          <p className="text-sm text-muted-foreground">
            {formatDayMonthYear(new Date(post.createdAt))}
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * The share card's drawing at the column's width. The card is drawn at
 * 1080 px, as it is rasterised, and scaled to fit; to a screen reader it
 * is one picture, named by the post's figures in a sentence.
 */
function PostCard({ post }: { post: PublicPostView }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <div
      ref={frame}
      role="img"
      aria-label={post.summary}
      className="relative aspect-square w-full overflow-hidden rounded-2xl card-shadow"
    >
      <div
        aria-hidden="true"
        style={{
          width: CARD_PX,
          height: CARD_PX,
          transform: `scale(${width / CARD_PX})`,
          transformOrigin: "top left",
        }}
      >
        <ShareCardRenderer data={publicPostCard(post)} offscreen={false} />
      </div>
    </div>
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

/** What Tropos is, in the welcome's own words. */
function AboutTropos() {
  return (
    <div>
      <h2 className="text-lg font-bold leading-snug text-foreground text-balance">
        Your training and food, planned together
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Answer a few questions and get a week of training and a daily calorie
        target that fit you.
      </p>
    </div>
  );
}
