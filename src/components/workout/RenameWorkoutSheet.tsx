import { useId, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useWordFilter } from "@/hooks/useWordFilter";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/objectionableMessages";
import {
  EMPTY_WORKOUT_NAME_MAX,
  emptyWorkoutName,
} from "@/features/program/emptyWorkout";

/**
 * A name for an empty workout, given on its finish screen (Mob2 call 11):
 * unnamed, it is saved as "Workout". The saved workout, its page and its
 * post carry the name (`emptyWorkoutName`), and a post is public, so a
 * name the word filter refuses is not taken. The filter loads when the
 * sheet opens; one that cannot load (offline) holds nothing back, since
 * the name stays on the person's own workout until they post it.
 */
export default function RenameWorkoutSheet({
  name,
  onSave,
  onClose,
}: {
  name: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState(name);
  const filter = useWordFilter();
  const refused = !!filter?.containsProfanity(typed);
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Name this workout"
      className="z-[70]"
      overlayClassName="z-[60]"
    >
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (refused) return;
          onSave(emptyWorkoutName(typed));
        }}
      >
        <label htmlFor={`${id}-name`} className="block space-y-2 text-sm">
          <span>Name</span>
          <input
            id={`${id}-name`}
            value={typed}
            maxLength={EMPTY_WORKOUT_NAME_MAX}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Hotel gym"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby={refused ? `${id}-refused` : undefined}
            className="ds-input min-h-[44px] w-full text-base"
          />
        </label>
        {refused && (
          <p
            id={`${id}-refused`}
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {OBJECTIONABLE_NAME_MESSAGE}
          </p>
        )}
        <Button type="submit" fullWidth disabled={refused}>
          Save name
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}
