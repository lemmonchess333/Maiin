import { useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Spline } from "lucide-react";
import { useAuth, useUid } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/LoadingSkeleton";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import SessionLoadState from "@/components/session/SessionLoadState";
import RunMap from "@/components/run/RunMapLazy";
import { useSegment, useSegmentBoard } from "@/hooks/useSegment";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { finishTimeLabel, nearDistanceLabel } from "@/lib/runLabels";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import {
  boardRows,
  removeSegment,
  segmentRejection,
  type BoardRow,
} from "@/lib/segments";
import type { GPSPoint } from "@/lib/gps";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** "12 Nov 2026", or nothing for an effort whose day can't be read. */
function dayLabel(day: string | null): string {
  return day ? formatDayMonthYear(parseLocalDate(day)) : "";
}

/** A segment's points as the map draws a route. */
function asTrace(points: readonly { lat: number; lon: number }[]): GPSPoint[] {
  return points.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    rawLat: p.lat,
    rawLon: p.lon,
    altitude: null,
    accuracy: 0,
    speed: null,
    timestamp: i,
  }));
}

/**
 * A segment's page (Run26 call 3): its line and length, your best time on
 * it, every effort of yours fastest first, and a board of the people you
 * follow who have run it, with you placed among them. There is no board of
 * everyone and no crown. Its maker can delete it, which takes every time
 * on it with it.
 */
export default function Segment() {
  const { segmentId } = useParams<{ segmentId: string }>();
  const uid = useUid();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const unit = useDistanceUnit();
  const darkTheme = useIsDarkTheme();
  const { blocked } = useBlockedUsers();
  const page = useSegment(uid, segmentId);
  const board = useSegmentBoard(segmentId, page.status === "ready");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const yoursId = useId();
  const boardId = useId();

  const trace = useMemo(
    () => (page.segment ? asTrace(page.segment.points) : []),
    [page.segment]
  );

  if (page.status !== "ready" || !page.segment)
    return (
      <SessionLoadState
        status={page.status}
        icon={Spline}
        loadingLabel="Loading segment"
        missingHeadline="Segment not found"
        missingSub="It may have been deleted by the person who made it."
        failedHeadline="Couldn’t load this segment"
        failedSub="Check your connection and try again."
        onRetry={page.retry}
        backHref="/history"
        backLabel="History"
      />
    );

  const segment = page.segment;
  const best = page.efforts[0] ?? null;
  const rows = boardRows(board.entries, best, uid ?? null, blocked);

  const remove = async () => {
    setDeleting(true);
    try {
      await removeSegment(segment.id);
      toast.success("Segment deleted");
      navigate(-1);
    } catch (err) {
      setDeleting(false);
      toast.error(
        segmentRejection(err) ?? "Couldn’t delete the segment. Try again."
      );
    }
  };

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

      <div>
        <h1
          dir="auto"
          className="break-words text-h1 font-extrabold tracking-tight"
        >
          {segment.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Segment ·{" "}
          <span className="font-mono tabular-nums">
            {nearDistanceLabel(segment.lengthMeters, unit)}
          </span>
        </p>
      </div>

      <div className="relative h-56 overflow-hidden rounded-xl">
        <RunMap
          points={trace}
          currentPoint={null}
          interactive={true}
          height="h-full"
          darkMode={darkTheme}
        />
      </div>

      {/* The hero: your best time, the page's one large figure. */}
      <Card className="space-y-1">
        <p className="text-sm font-semibold text-running-strong">Your best</p>
        {best ? (
          <>
            <p className="text-display font-extrabold font-figure tabular-nums leading-none text-foreground">
              {finishTimeLabel(best.elapsedSeconds)}
            </p>
            <p className="text-sm text-muted-foreground">
              {dayLabel(best.day)}
              {page.efforts.length > 1
                ? ` · fastest of ${page.efforts.length} runs`
                : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-foreground text-pretty">
            Run it with Tropos recording, and your time shows here.
          </p>
        )}
      </Card>

      {page.efforts.length > 0 && (
        <Card as="section" aria-labelledby={yoursId} className="space-y-1">
          <SectionHeading id={yoursId} size="compact">
            Your efforts
          </SectionHeading>
          <ol>
            {page.efforts.map((effort, i) => (
              <li key={effort.id}>
                <Link
                  to={`/run/${effort.runId}`}
                  className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center text-sm font-bold font-mono tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-foreground">
                    {dayLabel(effort.day)}
                  </span>
                  <span className="shrink-0 text-base font-bold font-mono tabular-nums text-foreground">
                    {finishTimeLabel(effort.elapsedSeconds)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section aria-labelledby={boardId} className="space-y-2">
        <SectionHeading id={boardId} size="compact">
          People you follow
        </SectionHeading>
        {board.status === "loading" ? (
          <ul aria-label="Loading the board" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl bg-card p-3 dark:card-shadow"
              >
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-32 rounded" />
              </li>
            ))}
          </ul>
        ) : board.status === "failed" ? (
          <ErrorState
            title="Couldn’t load the board"
            description="Check your connection and try again."
            retry={{ onClick: board.retry }}
          />
        ) : (
          <>
            {rows.length > 0 && (
              <ol aria-label={`${segment.name} board`} className="space-y-2">
                {rows.map((row, i) => (
                  <BoardRowItem
                    key={row.uid}
                    row={row}
                    place={i + 1}
                    selfPhoto={profile?.photoURL ?? undefined}
                    selfInitial={profile?.displayName?.charAt(0)}
                  />
                ))}
              </ol>
            )}
            {rows.every((r) => r.self) && (
              <p className="text-sm text-muted-foreground text-pretty">
                When people you follow share a run along it, their times show
                here.
              </p>
            )}
          </>
        )}
      </section>

      {page.mine && (
        <Button
          variant="destructive-tinted"
          fullWidth
          loading={deleting}
          onClick={() => setConfirmDelete(true)}
        >
          Delete segment
        </Button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this segment?"
        description="It goes for everyone, with every time anyone has on it."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function BoardRowItem({
  row,
  place,
  selfPhoto,
  selfInitial,
}: {
  row: BoardRow;
  place: number;
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
        <span className="block text-xs text-muted-foreground">
          {dayLabel(row.day)}
        </span>
      </span>
      <span className="ml-auto shrink-0 text-base font-bold font-mono tabular-nums text-foreground">
        {finishTimeLabel(row.elapsedSeconds)}
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
