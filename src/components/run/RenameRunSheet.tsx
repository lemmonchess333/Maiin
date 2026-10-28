import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import { RUN_NAME_MAX } from "@/lib/runName";
import { renameRun, runRenameValue } from "@/lib/runRename";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  runId: string;
  /** The name the run has now, which the field starts from. */
  currentName: string;
  /** The run has a post, which takes the new name too. */
  shared: boolean;
  onRenamed: (name: string) => void;
}

/**
 * Renames a saved run, from its page. The field starts from the run's
 * name and is cut where the finish screen's is (`RUN_NAME_MAX`). Save
 * waits for a name that differs from the one the run has.
 */
export default function RenameRunSheet({
  open,
  onOpenChange,
  uid,
  runId,
  currentName,
  shared,
  onRenamed,
}: Props) {
  // Remounted on each open (the page keys it), so the field starts from
  // the run's current name every time.
  const [draft, setDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const next = runRenameValue(draft);
  const canSave = !saving && next !== null && next !== currentName;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    haptic("light");
    try {
      const name = await renameRun(uid, runId, draft);
      onRenamed(name);
      toast.success("Run renamed");
      onOpenChange(false);
    } catch (err) {
      logger.error("renameRun failed:", err);
      toast.error("Couldn't rename the run. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
      title="Rename run"
      description={shared ? "Your post takes the new name too." : undefined}
    >
      <form
        className="px-4 pb-4 pt-3 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Run name"
          maxLength={RUN_NAME_MAX}
          autoComplete="off"
          enterKeyHint="done"
          dir="auto"
          className="ds-input text-base font-bold"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="flex-1 min-h-[44px]"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="sport"
            className="flex-1 min-h-[44px]"
            disabled={!canSave}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
