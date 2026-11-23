import { Link } from "react-router-dom";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { cn } from "@/lib/utils";

/** Who a board row is, and where it opens. */
export interface BoardRowPerson {
  uid: string;
  self: boolean;
  name: string;
  photoURL: string | null;
  /** The post it came from, or the viewer's own session; null for none. */
  href: string | null;
}

/**
 * One row of a board of the people you follow: a segment's (Run26 call 3)
 * and a lift's (Run30 call 3). The place is a plain number, never a medal
 * or a crown; your own row is tinted and marked current.
 */
export default function BoardRowItem({
  row,
  place,
  detail,
  figure,
  selfPhoto,
  selfInitial,
}: {
  row: BoardRowPerson;
  place: number;
  /** The line under the name: a day, or reps and a day. */
  detail: string;
  /** The figure the board ranks by, at the row's end. */
  figure: string;
  selfPhoto?: string;
  selfInitial?: string;
}) {
  const body = (
    <>
      <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center text-sm font-bold font-mono tabular-nums text-foreground">
        {place}
      </span>
      {row.self ? (
        <Avatar
          photoURL={selfPhoto}
          displayName="You"
          fallbackInitial={selfInitial}
          size="md"
        />
      ) : (
        <BlockAwareAvatar
          uid={row.uid}
          photoURL={row.photoURL ?? undefined}
          displayName={row.name}
          size="md"
        />
      )}
      <span className="min-w-[min(6em,100%)] flex-1">
        <span
          dir="auto"
          className="block truncate text-sm font-semibold text-foreground"
        >
          {row.name}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="ml-auto shrink-0 text-base font-bold font-mono tabular-nums text-foreground">
        {figure}
      </span>
    </>
  );
  const classes = cn(
    "flex min-h-[44px] flex-wrap items-center gap-x-[10px] gap-y-1 rounded-xl p-2.5",
    row.self
      ? "border border-primary/25 bg-primary/10"
      : "bg-card dark:card-shadow"
  );
  return (
    <li aria-current={row.self ? "true" : undefined}>
      {row.href ? (
        <Link
          to={row.href}
          className={cn(
            classes,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </li>
  );
}
