import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import SessionBadge from "@/components/workout/SessionBadge";
import SessionShareRow from "@/components/workout/SessionShareRow";
import type { SessionShareAction } from "@/lib/sessionPost";

const CompletionReminderChoice = lazyRetry(
  () => import("@/components/workout/CompletionReminderChoice")
);

/** Actions on a persisted session. Never opens a dialog on mount: sharing
 *  asks inline, once, and after that posts without one (SessionShareRow). */
export default function CompletionExtras({
  share,
  badge = true,
  kind,
  activationJourneyV2,
}: {
  share?: SessionShareAction;
  /** Show the session's badge here, first. The workout's finish screen
   *  shows it with its new bests instead (Pol1). */
  badge?: boolean;
  kind: "lift" | "run";
  activationJourneyV2: boolean;
}) {
  return (
    <div className="space-y-4">
      {badge && <SessionBadge />}
      {share && (
        // Keyed by session: a different session starts from its own state.
        <SessionShareRow
          key={`${share.uid}:${share.source.kind}:${share.source.id}`}
          action={share}
        />
      )}
      <Suspense fallback={null}>
        <CompletionReminderChoice
          kind={kind}
          activationJourneyV2={activationJourneyV2}
        />
      </Suspense>
    </div>
  );
}
