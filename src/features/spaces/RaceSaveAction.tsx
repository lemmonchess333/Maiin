import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { useSavedRaces } from "./useSavedRaces";

/** Detail-page save stays separate from joining the community or training. */
export default function RaceSaveAction({ id }: { id: string }) {
  const saved = useSavedRaces();
  const selected = saved.ids.has(id);
  return (
    <div className="space-y-1">
      {saved.error ? (
        <Button variant="secondary" fullWidth onClick={saved.retry}>
          Retry loading saved races
        </Button>
      ) : (
        <Button
          variant="sport-tinted"
          fullWidth
          leftIcon={
            <Bookmark
              className="size-4"
              fill={selected ? "currentColor" : "none"}
            />
          }
          aria-pressed={selected}
          loading={saved.pendingIds.has(id)}
          disabled={!saved.ready || !saved.isOnline}
          onClick={() => {
            haptic("light");
            void saved.toggle(id);
          }}
        >
          {!saved.ready
            ? "Loading saved races…"
            : selected
              ? "Saved race"
              : "Save race"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {!saved.isOnline
          ? "Connect to change saved races."
          : "Saved races are private to you."}
      </p>
    </div>
  );
}
