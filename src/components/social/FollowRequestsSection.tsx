import { Link } from "react-router-dom";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { useFollowRequests } from "@/hooks/useFollowRequests";
import { getTimeAgo } from "@/lib/timeAgo";
import { haptic } from "@/lib/haptic";

/**
 * Follow requests, at the top of People (Polish2: an account approves each
 * follower unless it turns that off in Settings → Privacy). Here so they
 * can be answered whether or not their notifications are on.
 *
 * Says nothing while there are none. A list that could not be read says so,
 * rather than looking empty.
 */
export default function FollowRequestsSection({ active }: { active: boolean }) {
  const { requests, status, reload, accept, decline } =
    useFollowRequests(active);

  if (status === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-card p-3">
        <p className="text-small text-muted-foreground">
          Couldn&rsquo;t load your follow requests.
        </p>
        <Button variant="secondary" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="follow-requests-heading" className="space-y-3">
      <SectionHeading id="follow-requests-heading">
        Follow requests
      </SectionHeading>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.uid}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3"
          >
            <Link
              to={`/user/${r.uid}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <BlockAwareAvatar
                uid={r.uid}
                photoURL={r.photoURL}
                displayName={r.displayName}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.displayName}
                </p>
                {r.requestedAt && (
                  <p className="text-micro text-muted-foreground">
                    Asked {getTimeAgo(r.requestedAt)}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex gap-2">
              <Button
                aria-label={`Accept ${r.displayName}`}
                onClick={() => {
                  haptic("medium");
                  void accept(r.uid);
                }}
              >
                Accept
              </Button>
              <Button
                variant="ghost"
                aria-label={`Decline ${r.displayName}`}
                onClick={() => {
                  haptic("light");
                  void decline(r.uid);
                }}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
