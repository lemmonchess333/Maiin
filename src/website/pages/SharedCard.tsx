/**
 * `/card/:token` on troposfit.com: one shared card's own page, where the
 * link in a card's words lands when the card is not of a public post
 * (Soc17 calls 1 to 3).
 *
 * The lockup, "Join Sam on Tropos" with the sharer's first name, the card
 * as it was sent (ShareCardRenderer, from the copy the server keeps), and
 * one button with the same words. With the sharer's invite code the button
 * opens the website's invite page, the code to copy and the App Store
 * badge (`WebsiteInvite`), so joining follows as an invite does; without
 * one it opens the App Store (`joinTropos.ts`). Nothing else about the
 * sharer: no photo, no full name.
 *
 * A card that is unknown, deleted, or whose sharer is restricted, being
 * deleted or gone gets one page, "This card isn’t available", which never
 * says why: the server answers them alike (functions/lib/sharedCardPage.js).
 * A run's card is drawn without its route's line; the server never has it.
 *
 * Signed-out screens sit on the plain page in one phone-wide column under
 * the lockup (DESIGN_GUIDE §14p), as a shared post's page does. A story
 * card is held to a little over half the screen's height so the button
 * stays on the first screen of a phone.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import AboutTropos from "@/components/auth/AboutTropos";
import AuthLockup from "@/components/auth/AuthLockup";
import ShareCardRenderer from "@/components/share/ShareCardRenderer";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { joinTroposHref, joinTroposWords } from "@/lib/joinTropos";
import { logger } from "@/lib/logger";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { loadSharedCard, type SharedCardView } from "@/lib/sharedCardPage";

type Read =
  | { status: "loading" }
  | { status: "ready"; view: SharedCardView }
  | { status: "unavailable" }
  | { status: "error" };

/** The card's drawn width (ShareCardRenderer). */
const CARD_PX = 1080;

const HEADING =
  "text-h2 font-extrabold leading-[1.12] tracking-tight text-foreground text-balance";

export default function SharedCard() {
  const { token = "" } = useParams<{ token: string }>();
  // Keyed, so another card's address starts from loading.
  return <SharedCardPage key={token} token={token} />;
}

function SharedCardPage({ token }: { token: string }) {
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadSharedCard(token)
      .then((view) => {
        if (!live) return;
        setRead(view ? { status: "ready", view } : { status: "unavailable" });
      })
      .catch((err: unknown) => {
        logger.warn("[shared-card] read failed", err);
        if (live) setRead({ status: "error" });
      });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  const join = read.status === "ready" ? read.view : null;
  const heading = join
    ? joinTroposWords(join.firstName)
    : read.status === "unavailable"
      ? "This card isn’t available"
      : read.status === "error"
        ? "Couldn’t load this card"
        : null;

  return (
    <div className="ds-auth-shell">
      <main className="ds-auth-page ds-page-stack">
        <AuthLockup />
        {heading && (
          <div>
            <h1 className={HEADING}>{heading}</h1>
            {read.status === "error" && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Check your connection and try again.
              </p>
            )}
          </div>
        )}
        {join && <CardFrame view={join} />}
        {read.status === "unavailable" && <AboutTropos />}
        {read.status === "error" && (
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
        )}
        {read.status === "loading" && (
          <div
            role="status"
            aria-label="Loading card"
            className="aspect-square w-full rounded-2xl bg-muted motion-safe:animate-pulse"
          />
        )}
        <a
          href={join ? joinTroposHref(join.inviteCode) : APP_STORE_URL}
          className={buttonClasses({ fullWidth: true, size: "md" })}
        >
          {join ? joinTroposWords(join.firstName) : "Get Tropos"}
        </a>
      </main>
    </div>
  );
}

/**
 * The card at the column's width, or for a story card at most a little
 * over half the screen's height. Drawn at 1080 px, as it is rasterised,
 * and scaled to fit; to a screen reader it is one picture, named by its
 * figures in a sentence.
 */
function CardFrame({ view }: { view: SharedCardView }) {
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
  const story = view.card.format === "story";
  const height = story ? 1920 : CARD_PX;
  return (
    <div
      ref={frame}
      role="img"
      aria-label={view.summary}
      className="relative mx-auto w-full overflow-hidden rounded-2xl card-shadow"
      style={{
        aspectRatio: `${CARD_PX} / ${height}`,
        ...(story ? { maxWidth: "calc(58svh * 9 / 16)" } : {}),
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: CARD_PX,
          height,
          transform: `scale(${width / CARD_PX})`,
          transformOrigin: "top left",
        }}
      >
        <ShareCardRenderer data={view.card} offscreen={false} />
      </div>
    </div>
  );
}
