/**
 * CIRCLE-SESSION-01 — explicit, summary-only session share into a
 * Circle, offered AFTER a planned session completes (lift complete
 * screen / post-run summary). Never auto-posted.
 *
 * Privacy contract (the whole point): the ONLY thing published is the
 * existing `session_completed` Goal Space event via
 * useGoalSpaces().publishEvent — whose checkEventPayload fence +
 * Firestore rules structurally forbid any other fields. No distance,
 * pace, route, volume, exercises, sets, duration, calories or
 * recovery data can ride along; the optional note is user-typed and
 * bounded (≤200 chars).
 *
 * Read cost: callers mount this component CONDITIONALLY
 * (`{shareOpen && <CircleShareSheet …/>}`), so the useGoalSpaces
 * journeys/spaces reads only ever fire when the user explicitly
 * enters the share flow — zero Firestore reads on the completion
 * screens themselves.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { GOAL_SPACE_TEXT_MAX } from "@/features/goalSpace/goalSpaceTypes";
import { useGoalSpaces } from "@/features/goalSpace/useGoalSpaces";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { loadWordFilter } from "@/lib/wordFilter";
import { useWordFilter } from "@/hooks/useWordFilter";
import { circleTitle } from "@/features/goalSpace/circleTitle";
import RestrictedNotice from "./RestrictedNotice";

interface CircleShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
}

export default function CircleShareSheet({
  open,
  onOpenChange,
  uid,
}: CircleShareSheetProps) {
  const {
    loading: circlesLoading,
    circles,
    loadFailed,
    reload,
    publishEvent,
  } = useGoalSpaces(uid);
  /* The names go through the word filter (circleTitle), and so does the
     note: it loads as the sheet opens, and the list waits for it. */
  const wordFilter = useWordFilter(open);
  const loading = circlesLoading || !wordFilter;
  // A restricted account shares nothing with a Circle (S4e).
  const { isRestricted } = useRestrictedStatus(uid);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Preselect the first ACTIVE circle once the list resolves (same
  // preference order as the featured-circle pick on Social), falling
  // back to the first. Never overrides an explicit selection, and once
  // made it stays put: a later change to the list never moves the circle
  // the user is looking at. Set during render, so the list's first frame
  // already shows it checked.
  if (!loading && selectedId === null) {
    const preferred = circles.find((c) => c.space.active) ?? circles[0];
    if (preferred) setSelectedId(preferred.space.id);
  }

  const share = async () => {
    if (!selectedId || busy || isRestricted) return;
    // The server takes a refused note back out (onGoalSpaceEventCreated);
    // saying so here keeps the person's words in the box to reword.
    const filter = wordFilter ?? (await loadWordFilter().catch(() => null));
    if (!filter) {
      toast.error("Couldn't share. Try again.");
      return;
    }
    if (filter.containsProfanity(note)) {
      toast.error(
        "This note contains objectionable language. Reword it and try again."
      );
      return;
    }
    haptic("light");
    setBusy(true);
    const ok = await publishEvent(
      selectedId,
      "session_completed",
      note.trim() || undefined
    );
    setBusy(false);
    if (ok) {
      toast.success("Shared with your circle.");
      onOpenChange(false);
    } else {
      // Stays open — the user keeps their note and selection.
      toast.error("Couldn't share. Try again.");
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share to circle"
      description="Only 'completed a session' is shared — never your numbers."
    >
      <div className="px-4 pt-3 pb-6 space-y-3">
        {loading && (
          <div className="flex justify-center py-8">
            <Spinner size="md" label="Loading circles" />
          </div>
        )}

        {/* A failed read is not having no Circles. */}
        {!loading && loadFailed && circles.length === 0 && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl bg-card p-3"
          >
            <p className="text-small text-muted-foreground">
              Couldn&rsquo;t load your circles.
            </p>
            <Button variant="secondary" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !loadFailed && circles.length === 0 && (
          <>
            <EmptyState
              compact
              icon={Users}
              headline="No circles yet"
              sub="Circles are small, invite-only groups around one shared goal."
            />
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                haptic("light");
                onOpenChange(false);
                navigate("/social");
              }}
            >
              Open Together
            </Button>
          </>
        )}

        {!loading && circles.length > 0 && (
          <>
            <div
              className="space-y-2"
              role="radiogroup"
              aria-label="Choose a circle"
            >
              {circles.map((c) => (
                <button
                  key={c.space.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedId === c.space.id}
                  onClick={() => {
                    haptic("light");
                    setSelectedId(c.space.id);
                  }}
                  className={cn(
                    "w-full min-h-[44px] p-3 rounded-xl text-left transition active:scale-[0.97]",
                    selectedId === c.space.id
                      ? "bg-primary/10 border border-primary/40"
                      : "bg-muted border border-transparent"
                  )}
                >
                  <p className="text-sm font-semibold text-foreground truncate">
                    {circleTitle(c.space, wordFilter)}
                    {!c.space.active && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · ended
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums">
                    {c.space.memberCount}{" "}
                    <span className="font-sans">
                      {c.space.memberCount === 1 ? "member" : "members"}
                    </span>
                  </p>
                </button>
              ))}
            </div>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={GOAL_SPACE_TEXT_MAX}
              placeholder="Add a note — optional"
              aria-label="Note"
              className="ds-input text-sm"
            />

            {isRestricted && <RestrictedNotice />}

            <Button
              className="w-full"
              loading={busy}
              disabled={selectedId === null || isRestricted}
              onClick={() => void share()}
            >
              Share to circle
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Not now
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
