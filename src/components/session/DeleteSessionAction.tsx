import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { deleteLoggedSession, type SessionKind } from "@/lib/sessionDelete";

/**
 * The delete affordance on `/workout/:id` and `/run/:id`.
 *
 * One component for both so the confirmation copy cannot drift between
 * them — the copy is the load-bearing part here, not the button. ADR-0012
 * is explicit that deleting a session can lower the user's standing in a
 * live challenge, that this is the correct behaviour for a mis-log, and
 * that "the copy should not pretend otherwise". It also leaves three
 * things standing on purpose (partner streaks, milestone badges,
 * `fastest_effort` bests), which a user reading "delete" would reasonably
 * assume are coming back.
 *
 * Placed at the bottom of the page, low-emphasis, behind a confirmation:
 * it is a records correction for a mis-log, not a primary action, and it
 * is irreversible.
 */
export default function DeleteSessionAction({
  uid,
  kind,
  id,
  sharedActivityId,
}: {
  uid: string;
  kind: SessionKind;
  id: string;
  sharedActivityId?: string | null;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const noun = kind === "workout" ? "workout" : "run";

  return (
    <>
      <div className="pt-2">
        {/* `destructive-tinted`, not `destructive`: the variant exists for
            exactly this shape — a danger action gated by a confirm step,
            where a filled red over-escalates — and it carries the AA red
            text step that the bare `--destructive` identity misses at
            this size. */}
        <Button
          fullWidth
          variant="destructive-tinted"
          disabled={busy}
          onClick={() => {
            haptic("light");
            setConfirming(true);
          }}
          leftIcon={<Trash2 className="size-4 shrink-0" />}
        >
          Delete this {noun}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Delete this ${noun}?`}
        description={[
          `This can't be undone. Your challenge progress and lifetime totals will drop by what this ${noun} contributed, so your standing in a live challenge can go down.`,
          "Streaks and badges you've already earned stay.",
          sharedActivityId
            ? "Its post is removed from your feed too."
            : `Any post you've already shared about this ${noun} stays on your feed.`,
        ].join(" ")}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          setBusy(true);
          haptic("heavy");
          try {
            await deleteLoggedSession({ uid, kind, id, sharedActivityId });
            toast.success(
              `${noun === "workout" ? "Workout" : "Run"} deleted`
            );
            // Back to wherever they came from — History, Home's day card,
            // a deep link. Replacing the entry means the browser Back
            // button can't return to a detail page whose document is gone.
            navigate("/history", { replace: true });
          } catch {
            setBusy(false);
            toast.error(`Couldn't delete this ${noun}. Try again.`);
          }
        }}
      />
    </>
  );
}
