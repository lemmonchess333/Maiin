import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { ChevronLeft, UserMinus, Users } from "lucide-react";
import { useUid } from "@/lib/auth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import {
  getFollowListPage,
  removeFollower,
  type FollowListKind,
  type FollowListPerson,
} from "@/lib/followLists";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import FollowButton from "@/components/social/FollowButton";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/LoadingSkeleton";

/** What the page says while a list is empty, for each list. */
const EMPTY: Record<FollowListKind, { headline: string; sub: string }> = {
  followers: {
    headline: "No followers yet",
    sub: "People who follow you show here.",
  },
  following: {
    headline: "You don't follow anyone yet",
    sub: "People you follow show here, and their sessions in your feed.",
  },
};

type Status = "loading" | "ready" | "failed";

/**
 * Your own followers and following (Mob2 call 7), opened from the counts on
 * your profile: a row for each person, newest first, with Follow, and on
 * your followers Remove follower. Someone blocked either way is left out,
 * as on every social surface. Anyone else's lists are not shown: their
 * profile keeps its counts as plain text.
 */
export default function FollowList({ kind }: { kind: FollowListKind }) {
  const uid = useUid();
  const navigate = useNavigate();
  const { blocked } = useBlockedUsers();
  const [people, setPeople] = useState<FollowListPerson[]>([]);
  const [next, setNext] = useState<QueryDocumentSnapshot | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<FollowListPerson | null>(null);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    getFollowListPage(uid, kind)
      .then((page) => {
        if (!live) return;
        setPeople(page.people);
        setNext(page.next);
        setStatus("ready");
      })
      .catch((err) => {
        if (!live) return;
        logger.error("[followList] load failed", err);
        setStatus("failed");
      });
    return () => {
      live = false;
    };
  }, [uid, kind, attempt]);

  const loadMore = useCallback(async () => {
    if (!uid || !next || more) return;
    setMore(true);
    try {
      const page = await getFollowListPage(uid, kind, next);
      setPeople((list) => [
        ...list,
        ...page.people.filter((p) => !list.some((q) => q.uid === p.uid)),
      ]);
      setNext(page.next);
    } catch (err) {
      logger.error("[followList] next page failed", err);
      toast.error("Couldn't load more. Try again.");
    } finally {
      setMore(false);
    }
  }, [uid, kind, next, more]);

  const confirmRemove = async () => {
    const person = removing;
    setRemoving(null);
    if (!person) return;
    const before = people;
    setPeople((list) => list.filter((p) => p.uid !== person.uid));
    haptic("light");
    try {
      await removeFollower(person.uid);
      toast.success(`Removed ${person.displayName}`);
    } catch (err) {
      logger.error("[followList] remove failed", err);
      setPeople(before);
      toast.error("Couldn't remove the follower. Try again.");
    }
  };

  const shown = people.filter((p) => !blocked.has(p.uid));
  const title = kind === "followers" ? "Followers" : "Following";

  return (
    <div className="space-y-4">
      <Button
        onClick={() => navigate(-1)}
        variant="ghost"
        size="sm"
        leftIcon={<ChevronLeft className="size-4" />}
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        Back
      </Button>
      <h1 className="text-h1 font-extrabold tracking-tight">{title}</h1>
      <SegmentedControl
        ariaLabel="Followers or following"
        options={[
          { value: "followers", label: "Followers" },
          { value: "following", label: "Following" },
        ]}
        value={kind}
        onChange={(value) => {
          if (value !== kind) navigate(`/${value}`, { replace: true });
        }}
      />

      {status === "failed" ? (
        <ErrorState
          title={`Couldn't load your ${kind === "followers" ? "followers" : "following list"}`}
          description="Check your connection and try again."
          retry={{
            onClick: () => {
              setStatus("loading");
              setAttempt((n) => n + 1);
            },
          }}
        />
      ) : status === "loading" ? (
        <ul aria-label={`Loading ${title.toLowerCase()}`} className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl bg-card p-3"
            >
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-32 rounded" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 && !next ? (
        <EmptyState
          icon={Users}
          headline={EMPTY[kind].headline}
          sub={EMPTY[kind].sub}
        />
      ) : (
        <>
          <ul aria-label={title} className="space-y-2">
            {shown.map((person) => (
              <li
                key={person.uid}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3"
              >
                <Link
                  to={`/user/${person.uid}`}
                  className="flex min-h-[44px] min-w-0 flex-1 basis-40 items-center gap-3"
                >
                  <BlockAwareAvatar
                    uid={person.uid}
                    photoURL={person.photoURL}
                    displayName={person.displayName}
                    size="md"
                  />
                  <span
                    dir="auto"
                    className="min-w-0 flex-1 break-words text-sm font-medium text-foreground"
                  >
                    {person.displayName}
                  </span>
                </Link>
                <div className="ml-auto flex items-center gap-1">
                  <FollowButton targetUid={person.uid} />
                  {kind === "followers" && (
                    <IconButton
                      variant="ghost"
                      aria-label={`Remove ${person.displayName} as a follower`}
                      icon={<UserMinus aria-hidden="true" />}
                      className="size-[44px] text-muted-foreground"
                      onClick={() => setRemoving(person)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          {next && (
            <Button
              variant="secondary"
              fullWidth
              loading={more}
              onClick={() => void loadMore()}
            >
              Show more
            </Button>
          )}
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={
          removing ? `Remove ${removing.displayName}?` : "Remove follower?"
        }
        description="They won't be told. They stop seeing the sessions you share with followers."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
