/**
 * `/card/:token` on troposfit.com: one shared card's own page, where the
 * link in a card's words lands when the card is not of a public post
 * (Soc17 calls 1 and 2, in the owner's layout of 22 Nov 2026,
 * `SharedLanding`).
 *
 * The small lockup, "Sam shared a workout" (the sharer's first name and
 * what the card shows), the card as it was sent (ShareCardRenderer, from
 * the copy the server keeps, a lift's drawing the website's own copy of
 * the cut-out), one button, "Join Tropos", and a line about Tropos. With
 * the code the card was shared with, the button opens the website's
 * invite page, the code to copy and the App Store badge
 * (`WebsiteInvite`), so joining follows as an invite does; without one it
 * opens the App Store (`joinTropos.ts`). Nothing else about the sharer: no
 * photo, no full name.
 *
 * A card that is unknown, deleted, past its 30 days, or whose sharer is
 * restricted, being deleted or gone gets one page, "This card isn’t
 * available", which never says why: the server answers them alike
 * (functions/lib/sharedCardPage.js). A run's card is drawn without its
 * route's line; the server never has it.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  SharedCardFrame,
  SharedLanding,
} from "@/components/share/SharedLanding";
import { Button } from "@/components/ui/Button";
import { joinTroposHref, sharedLine } from "@/lib/joinTropos";
import { logger } from "@/lib/logger";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { loadSharedCard, type SharedCardView } from "@/lib/sharedCardPage";

type Read =
  | { status: "loading" }
  | { status: "ready"; view: SharedCardView }
  | { status: "unavailable" }
  | { status: "error" };

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

  if (read.status === "ready") {
    const { view } = read;
    return (
      <SharedLanding
        line={sharedLine(
          view.firstName,
          view.card.template,
          view.card.recapTitle
        )}
        href={joinTroposHref(view.inviteCode)}
      >
        <SharedCardFrame data={view.card} label={view.summary} />
      </SharedLanding>
    );
  }
  if (read.status === "unavailable") {
    return (
      <SharedLanding title="This card isn’t available" href={APP_STORE_URL} />
    );
  }
  if (read.status === "error") {
    return (
      <SharedLanding title="Couldn’t load this card" href={APP_STORE_URL}>
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
        aria-label="Loading card"
        className="aspect-square w-full rounded-2xl bg-muted motion-safe:animate-pulse"
      />
    </SharedLanding>
  );
}
