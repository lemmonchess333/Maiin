/**
 * A Space's members' sessions (Run27 call 11): the sessions its members
 * shared with everyone, newest first, each the same card Following and
 * Explore draw (props, comments, the report and block menu, a run's map cut
 * at its author's privacy zones when it was shared). What reaches the list
 * is decided in `useSpaceSessions` and on the server; this only draws it.
 *
 * Its own chunk, loaded when the page's Sessions view first opens: the
 * reads start then too, so a visit that stays on Posts pays for neither.
 */
import { Footprints } from "lucide-react";
import ActivityCard from "@/components/social/ActivityCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useSpaceSessions } from "./useSpaceSessions";

export default function SpaceSessionList({
  spaceId,
  accent,
  followAuthor,
}: {
  spaceId: string;
  accent: string;
  /** Offer Follow beside an author the viewer does not follow. */
  followAuthor: boolean;
}) {
  const { items, hasMore, loadingMore, failed, loadMore, retry } =
    useSpaceSessions(spaceId, true);

  if (items === null && failed) {
    return (
      <ErrorState
        title="Couldn’t load sessions"
        description="Check your connection and try again."
        retry={{ onClick: retry }}
      />
    );
  }
  if (items === null) {
    return (
      <div
        className="h-24 rounded-2xl bg-muted/40 motion-safe:animate-pulse"
        aria-hidden
        data-testid="space-sessions-loading"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="space-sessions">
      {items.length === 0 && !hasMore ? (
        <EmptyState
          icon={Footprints}
          headline="Sessions shared with everyone"
          sub="When members share a session with everyone, it shows here."
          accent={accent}
          compact
        />
      ) : (
        items.map((item) => (
          <ActivityCard
            key={item.id}
            feedItem={item}
            followAuthor={followAuthor}
          />
        ))
      )}
      {hasMore && (
        <Button
          variant="ghost"
          fullWidth
          loading={loadingMore}
          onClick={loadMore}
        >
          Load more sessions
        </Button>
      )}
    </div>
  );
}
