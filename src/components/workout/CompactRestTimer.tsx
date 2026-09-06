import { Button } from "@/components/ui/Button";

/** A stable header row: resting never changes the set action's label. */
export default function CompactRestTimer({
  seconds,
  target,
  onStop,
  onChangeTarget,
}: {
  seconds: number;
  target: number;
  onStop: () => void;
  onChangeTarget: (value: number) => void;
}) {
  return (
    <div
      className="border-b border-border/50 px-4 py-1 flex items-center gap-2"
      role="group"
      aria-label="Rest timer"
    >
      <span className="flex-1 text-sm text-muted-foreground">
        Rest{" "}
        <span className="font-mono tabular-nums">
          {Math.max(0, target - seconds)} s
        </span>
      </span>
      <Button
        variant="ghost"
        aria-label="Add 15 seconds of rest"
        onClick={() => onChangeTarget(target + 15)}
      >
        +<span className="font-mono tabular-nums">15</span> s
      </Button>
      <Button variant="ghost" onClick={onStop}>
        End rest
      </Button>
    </div>
  );
}
