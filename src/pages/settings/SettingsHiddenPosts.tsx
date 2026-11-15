/**
 * SettingsHiddenPosts — the posts you hid from your feed, each with
 * Unhide (App1 Q38, Settings → Social & privacy → Hidden posts).
 *
 * A post is hidden from the report form ("Hide from my feed", S4c). Until
 * this page, hiding was one-way: a mis-tap hid a post for good. The list
 * is `users/{uid}/hiddenPosts` (`useHiddenActivities`); each post is read
 * as anyone reads it (`fetchActivitiesByIds`), so the rules decide, and a
 * row shows its author's current name, the post's one line and its day.
 *
 * Blocks: a post whose author is blocked either way is left out, as every
 * social surface leaves them out (CLAUDE.md, S4 / Polish3 call 1). Its
 * record stays, so it is still hidden if the block is lifted and shows
 * here again then. Unhiding it while blocked would show nothing anyway:
 * the feed leaves the author out.
 *
 * A post nobody can read any more (deleted, or no longer shared with you)
 * is "Post not available", with Remove. Its record is never dropped by
 * itself: a refused read is not proof the post is gone.
 */
import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "@/lib/toast";
import { useHiddenActivities } from "@/hooks/useHiddenActivities";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { fetchActivitiesByIds } from "@/lib/socialApi";
import { hiddenPostLine, type HiddenPost } from "@/lib/hiddenPosts";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

/** A post as read: its fields, or null when it can no longer be read. */
type PostRead = Record<string, unknown> | null;

interface Row {
  hidden: HiddenPost;
  post: PostRead;
}

function authorOf(post: PostRead): string | undefined {
  return typeof post?.authorId === "string" ? post.authorId : undefined;
}

export default function SettingsHiddenPosts() {
  const { posts, ready, hide, unhide } = useHiddenActivities();
  const { blocked, ready: blocksReady } = useBlockedUsers();
  const unit = useDistanceUnit();
  const [reads, setReads] = useState<ReadonlyMap<string, PostRead>>(
    () => new Map()
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const listed = posts.filter((p) => !(p.authorId && blocked.has(p.authorId)));
  const toRead = listed
    .filter((p) => !reads.has(p.activityId))
    .map((p) => p.activityId);
  /* Nothing is read until the blocks are known, so a post from someone
     blocked is never asked for: the rules would refuse it, and it would
     flash as not available before it left. */
  const toReadKey = ready && blocksReady ? toRead.join("|") : "";

  useEffect(() => {
    if (!toReadKey) return;
    let cancelled = false;
    const ids = toReadKey.split("|");
    fetchActivitiesByIds(ids).then(
      (found) => {
        if (cancelled) return;
        setFailed(false);
        setReads((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, found[id] ?? null);
          return next;
        });
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [toReadKey, attempt]);

  const rows: Row[] = listed.flatMap((hidden) => {
    if (!reads.has(hidden.activityId)) return [];
    const post = reads.get(hidden.activityId) ?? null;
    const author = authorOf(post);
    if (author && blocked.has(author)) return [];
    return [{ hidden, post }];
  });

  const loading =
    !ready ||
    !blocksReady ||
    (rows.length === 0 && toRead.length > 0 && !failed);

  const showAgain = (row: Row) => {
    const id = row.hidden.activityId;
    void unhide(id).then((ok) => {
      if (!ok)
        toast.error("Couldn’t unhide it. Try again.", {
          id: `hidden-post-error-${id}`,
        });
    });
    toast(row.post ? "Back in your feed" : "Removed from the list", {
      id: `hidden-post-${id}`,
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => hide(id, row.hidden.authorId ?? authorOf(row.post)),
      },
    });
  };

  return (
    <SettingsSection
      title="Hidden posts"
      subtitle="Posts you’ve hidden from your feed"
      backTo="/settings/privacy"
      backLabel="Social & privacy"
    >
      {failed && toRead.length > 0 && (
        <ErrorState
          title="Couldn’t load your hidden posts"
          description="Check your connection and try again."
          retry={{
            onClick: () => {
              setFailed(false);
              setAttempt((n) => n + 1);
            },
          }}
        />
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : rows.length === 0 ? (
        !failed && (
          <Card>
            <EmptyState
              compact
              icon={EyeOff}
              headline="Posts you hide show here"
              sub="Hiding a post takes it out of your feed on all your devices, and nobody is told. To hide one, open its menu, choose Report activity and keep Hide from my feed on."
            />
          </Card>
        )
      ) : (
        <SettingsGroup
          title={`${rows.length} hidden ${rows.length === 1 ? "post" : "posts"}`}
          footer="Only you see this list. Unhide puts a post back in your feed."
        >
          {rows.map((row) => {
            const name =
              typeof row.post?.authorName === "string" &&
              row.post.authorName.trim()
                ? row.post.authorName.trim()
                : null;
            return (
              <SettingsRow
                key={row.hidden.activityId}
                label={
                  row.post ? (name ?? "Name unavailable") : "Post not available"
                }
                description={
                  row.post ? (
                    <span className="font-mono tabular-nums">
                      {hiddenPostLine(row.post, unit)}
                    </span>
                  ) : (
                    "Deleted, or no longer shared with you"
                  )
                }
                trailing={
                  <Button
                    variant="outline"
                    aria-label={
                      row.post
                        ? `Unhide ${name ? `${name}’s post` : "this post"}`
                        : "Remove this post from the list"
                    }
                    onClick={() => showAgain(row)}
                  >
                    {row.post ? "Unhide" : "Remove"}
                  </Button>
                }
              />
            );
          })}
        </SettingsGroup>
      )}
    </SettingsSection>
  );
}
