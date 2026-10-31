import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import type { MouseEvent } from "react";
import { cameFromInApp } from "@/lib/backNavigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Dumbbell,
  Footprints,
  Search,
  X,
} from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import SectionHeading from "@/components/ui/SectionHeading";
import MetaLine from "@/components/ui/MetaLine";
import { Skeleton } from "@/components/LoadingSkeleton";
import HistoryDateSheet from "@/components/analytics/HistoryDateSheet";
import { useAuth } from "@/lib/auth";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  useTrainingHistoryPosition,
  useTrainingHistoryRestore,
} from "@/hooks/useTrainingHistoryPosition";
import { SAVED_WORKOUTS } from "@/lib/savedWorkouts";
import { SAVED_RUNS } from "@/lib/savedRuns";
import { pendingDocumentWrites } from "@/lib/offlineQueue";
import {
  historyDateLabel,
  trainingHistoryFilters,
  trainingHistorySearch,
  trainingHistorySessions,
  type HistorySession,
  type TrainingHistoryFilters,
} from "@/lib/trainingHistory";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { workoutsWithBests } from "@/lib/workoutBests";
import { formatDayMonthYear, formatMonthYear } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

/** A click the browser takes elsewhere (a new tab or window), which the
 *  page leaves alone. */
const newTabClick = (event: MouseEvent) =>
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

export default function TrainingHistory() {
  const { user } = useAuth();
  const today = useLocalDateKey();
  const unit = useDistanceUnit();
  const liftUnit = useLiftUnit();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(
    () => trainingHistoryFilters(params, today),
    [params, today]
  );
  const search = trainingHistorySearch(filters);
  useEffect(() => {
    // An explicit period survives a detail visit that crosses midnight.
    if (location.search !== search)
      setParams(new URLSearchParams(search), {
        replace: true,
        state: location.state,
      });
  }, [location.search, location.state, search, setParams]);
  const [datesOpen, setDatesOpen] = useState(false);
  const position = useTrainingHistoryPosition(user?.uid, search);
  // Thirty at a time (XB1 call 3): each source reads the period's newest as
  // many sessions as are shown, and Show more reads thirty more, so a long
  // period never streams every route. Equal dates keep their order across
  // reads, so a page boundary never skips a same-day session.
  const sessionWindow = {
    since: filters.from,
    until: filters.to,
    cap: position.count,
  };
  const lifts = useSavedSessions(
    SAVED_WORKOUTS,
    user?.uid,
    filters.sport === "runs" ? null : sessionWindow
  );
  const runs = useSavedSessions(
    SAVED_RUNS,
    user?.uid,
    filters.sport === "lifts" ? null : sessionWindow
  );
  const sources =
    filters.sport === "runs"
      ? [runs]
      : filters.sport === "lifts"
        ? [lifts]
        : [lifts, runs];
  const pending = sources.some((source) => !source.answered);
  const failed = sources.some((source) => source.readFailed);
  const complete = sources.every((source) => source.evidenceReady);
  const provisional = !pending && !failed && !complete;
  const sessions = useMemo(
    () =>
      trainingHistorySessions(lifts.items, runs.items, filters, unit, liftUnit),
    [lifts.items, runs.items, filters, unit, liftUnit]
  );
  // An empty period offers the last session: one newest read of each.
  const empty = !pending && !failed && complete && sessions.length === 0;
  const lastLift = useSavedSessions(
    SAVED_WORKOUTS,
    user?.uid,
    empty && !filters.search ? { latest: 1 } : null
  );
  const lastRun = useSavedSessions(
    SAVED_RUNS,
    user?.uid,
    empty && !filters.search ? { latest: 1 } : null
  );
  const lastDay = [lastLift.items[0]?.date, lastRun.items[0]?.day]
    .filter((day): day is string => !!day && day < filters.from)
    .sort()
    .at(-1);
  // The rows on screen that set a new best, worked out after the page.
  const [bests, setBests] = useState<{ key: string; ids: Set<string> }>();
  const visible = sessions.slice(0, position.count);
  const shownLifts = lifts.items.filter((w) =>
    visible.some((row) => row.key === `lift:${w.id}`)
  );
  const bestsKey = shownLifts.map((w) => w.id).join();
  useEffect(() => {
    if (!user?.uid || !bestsKey) return;
    let live = true;
    workoutsWithBests(user.uid, shownLifts)
      .then((ids) => live && setBests({ key: bestsKey, ids }))
      .catch(() => {});
    return () => {
      live = false;
    };
    // shownLifts is read through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, bestsKey]);
  useTrainingHistoryRestore(position, !pending, sessions.length, provisional);
  // A source that filled its read may hold more of the period.
  const more =
    position.count < sessions.length ||
    sources.some((source) => source.items.length >= position.count);
  const groups = new Map<string, HistorySession[]>();
  for (const session of visible) {
    const month = session.day.slice(0, 7);
    const rows = groups.get(month) ?? [];
    rows.push(session);
    groups.set(month, rows);
  }
  const queued = new Set(
    user
      ? ["workouts", "runs"].flatMap((collection) =>
          pendingDocumentWrites(
            user.uid,
            `users/${user.uid}/${collection}`
          ).map(
            (entry) => `${collection === "runs" ? "run" : "lift"}:${entry.id}`
          )
        )
      : []
  );
  const entered = location.state as {
    returnTo?: unknown;
    returnState?: unknown;
  } | null;
  const returnTo = entered?.returnTo;
  const backTo =
    typeof returnTo === "string" &&
    /^(?:\/program\/plan|\/history)(?:\?[^#]*)?$/.test(returnTo)
      ? returnTo
      : "/history";
  // The screen this was opened from keeps its own state (the plan's review
  // or reset): Back returns to that entry, or, opened directly, replaces
  // this one with it, never stacking a fresh copy on top.
  const navigate = useNavigate();
  function back(event: MouseEvent) {
    if (newTabClick(event) || !cameFromInApp()) return;
    event.preventDefault();
    navigate(-1);
  }

  function change(next: Partial<TrainingHistoryFilters>) {
    const value = { ...filters, ...next };
    // Pin relative dates into the URL as soon as a filter changes, so Back is
    // still the same period after midnight or after opening an older session.
    const query = trainingHistorySearch(value);
    position.reset(query);
    setParams(new URLSearchParams(query), {
      replace: true,
      state: location.state,
    });
  }
  function retry() {
    lifts.refresh();
    runs.refresh();
  }
  const sourceName =
    lifts.readFailed && runs.readFailed
      ? "Training"
      : runs.readFailed
        ? "Run"
        : "Lift";
  const noun =
    filters.sport === "runs"
      ? "run"
      : filters.sport === "lifts"
        ? "lift"
        : "session";

  return (
    <PageShell
      title="Training history"
      subtitle="Your saved lifts and runs"
      className="min-w-0"
      eyebrow={
        <Link
          to={backTo}
          state={entered?.returnState}
          replace
          onClick={back}
          className="inline-flex min-h-[44px] items-center gap-1 -ml-2 px-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backTo.startsWith("/program") ? "Your plan" : "Analytics"}
        </Link>
      }
    >
      <section aria-label="Filter saved sessions" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Session type"
            value={filters.sport}
            onChange={(sport) => change({ sport })}
            className="flex-1 basis-[11rem]"
            options={[
              { value: "all", label: "All" },
              { value: "lifts", label: "Lifts" },
              { value: "runs", label: "Runs" },
            ]}
          />
          <Button
            variant="secondary"
            className="max-w-full h-auto min-h-[44px] whitespace-normal py-2 text-left"
            leftIcon={<CalendarDays className="size-4 shrink-0" />}
            rightIcon={<ChevronDown className="size-4 shrink-0" />}
            onClick={() => setDatesOpen(true)}
            aria-haspopup="dialog"
          >
            {historyDateLabel(filters, today)}
          </Button>
        </div>
        <div className="relative">
          <label className="sr-only" htmlFor="history-search">
            Search sessions in this period
          </label>
          <Search
            className="absolute left-[14px] top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="history-search"
            type="search"
            className="ds-input w-full min-h-[48px] pl-[calc(24px+1.25rem)] pr-[calc(4px+2.75rem)] [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search in this period"
            maxLength={120}
            value={filters.search}
            onChange={(e) => change({ search: e.target.value })}
          />
          {filters.search && (
            <IconButton
              aria-label="Clear search"
              icon={<X />}
              className="absolute right-[2px] top-1/2 -translate-y-1/2"
              onClick={() => change({ search: "" })}
            />
          )}
        </div>
      </section>
      {failed && (
        <ErrorState
          title={`${sourceName} history couldn't load`}
          description={
            sessions.length
              ? "Available sessions are shown below. Retry to load the rest."
              : "Your saved sessions have not been changed. Try loading this period again."
          }
          retry={{ onClick: retry }}
        />
      )}
      {provisional && (
        <Banner
          variant="neutral"
          description="Showing available sessions on this device. This period may be incomplete until history finishes syncing."
          action={
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          }
        />
      )}
      <section
        aria-label="Saved sessions"
        className="space-y-4"
        aria-busy={pending}
      >
        <div
          className="flex flex-wrap justify-between items-baseline gap-2"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold font-mono tabular-nums">
            {pending && sessions.length === 0
              ? "Loading sessions…"
              : failed && sessions.length === 0
                ? "History unavailable"
                : `${sessions.length} ${noun}${sessions.length === 1 ? "" : "s"}${complete && !more ? "" : " shown"}`}
          </p>
          <span className="text-xs text-muted-foreground">Newest first</span>
        </div>
        {pending && (
          <p className="text-sm text-muted-foreground" role="status">
            {sessions.length > 0
              ? "Updating this period…"
              : "Loading saved lifts and runs…"}
          </p>
        )}
        {pending && sessions.length === 0 ? (
          <Card
            padded={false}
            size="compact"
            className="p-[12px] space-y-4"
            aria-hidden="true"
          >
            {[0, 1, 2].map((key) => (
              <div className="flex gap-3 py-3" key={key}>
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            ))}
          </Card>
        ) : sessions.length > 0 ? (
          <>
            {[...groups].map(([month, rows]) => (
              <section
                key={month}
                aria-label={formatMonthYear(parseLocalDate(`${month}-01`))}
                className="space-y-2"
              >
                <SectionHeading size="compact">
                  {formatMonthYear(parseLocalDate(`${month}-01`))}
                </SectionHeading>
                <Card
                  padded={false}
                  size="compact"
                  className="overflow-hidden @container"
                >
                  <ul className="divide-y divide-border/50">
                    {rows.map((session) => (
                      <li key={session.key}>
                        <Link
                          to={session.href}
                          state={{
                            trainingHistoryReturnTo: `${location.pathname}${location.search}`,
                          }}
                          onClick={(event) => {
                            if (newTabClick(event)) return;
                            position.remember();
                            haptic("light");
                            window.scrollTo({
                              top: 0,
                              behavior: "instant",
                            });
                          }}
                          className="flex min-h-[100px] items-center gap-[12px] p-[12px] text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <span
                            className={cn(
                              "size-9 rounded-lg shrink-0 inline-flex items-center justify-center @max-[12rem]:hidden",
                              session.kind === "lift"
                                ? "bg-lifting/12 text-lifting-strong"
                                : "bg-running/12 text-running-strong"
                            )}
                            aria-label={
                              session.kind === "lift" ? "Lift" : "Run"
                            }
                          >
                            {session.kind === "lift" ? (
                              <Dumbbell className="size-5" aria-hidden="true" />
                            ) : (
                              <Footprints
                                className="size-5"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <time
                              dateTime={session.day}
                              className="text-xs text-muted-foreground"
                            >
                              {formatDayMonthYear(parseLocalDate(session.day))}
                            </time>
                            <span className="text-base font-bold break-words [overflow-wrap:anywhere]">
                              {session.title}
                              {bests?.key === bestsKey &&
                                bests.ids.has(session.id) &&
                                session.kind === "lift" && (
                                  <span className="ml-2 text-micro font-semibold text-achievement-strong">
                                    PR
                                  </span>
                                )}
                            </span>
                            <MetaLine size="xs" items={session.summary} />
                            {session.notCounted && (
                              <span className="text-xs text-muted-foreground">
                                Saved · Not counted
                              </span>
                            )}
                            {queued.has(session.key) && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <CloudUpload
                                  className="size-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                                Saved on this phone · Waiting to sync
                              </span>
                            )}
                          </div>
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground @max-[12rem]:hidden"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
            {more && (
              <Button fullWidth variant="ghost" onClick={position.showMore}>
                Show more sessions
              </Button>
            )}
          </>
        ) : !pending && !failed && !complete ? (
          <EmptyState
            headline="This period isn't fully loaded"
            sub="No matching sessions are available on this device yet. Connect and retry to check the full period."
            action={{ label: "Try again", onClick: retry }}
          />
        ) : !pending && !failed ? (
          <EmptyState
            headline={
              filters.search.trim()
                ? "No matching sessions"
                : "No saved sessions in this period"
            }
            sub={
              filters.search.trim()
                ? "Try another name or clear the search to see this period's sessions."
                : "Choose another date range to look through older training."
            }
            action={
              filters.search.trim()
                ? {
                    label: "Clear search",
                    onClick: () => change({ search: "" }),
                  }
                : lastDay
                  ? {
                      label: "Jump to your last session",
                      onClick: () =>
                        change({
                          from: localDateString(
                            addLocalDays(parseLocalDate(lastDay), -29)
                          ),
                          to: lastDay,
                        }),
                    }
                  : {
                      label: "Change dates",
                      onClick: () => setDatesOpen(true),
                    }
            }
          />
        ) : null}
      </section>
      {datesOpen && (
        <HistoryDateSheet
          dates={filters}
          today={today}
          onClose={() => setDatesOpen(false)}
          onApply={(dates) => {
            setDatesOpen(false);
            change(dates);
          }}
        />
      )}
    </PageShell>
  );
}
