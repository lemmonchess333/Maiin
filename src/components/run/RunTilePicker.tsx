/**
 * RunTilePicker — the freeform "pick a run" surface (run fast-launch arc,
 * 2026-07).
 *
 * The default waiting-phase surface when there's NO confident planned run
 * (freeform users, rest days, completed days, ad-hoc). Four one-tap tiles —
 * Easy / Tempo / Long / Free — launch straight into the run (a real gesture,
 * so audio primes). Structured sessions that need setup (Intervals, Treadmill,
 * Guided, Race, Follow a route) live one tap deeper behind "More options",
 * which opens the full RunSetupModal.
 *
 * Runna parity: simple session types are one tap; structured setup is one tap
 * deeper. See scratchpad spec `spec-run-fast-launch.md` §10.
 */
import {
  ArrowLeft,
  Footprints,
  PersonStanding,
  Zap,
  Route,
  SlidersHorizontal,
} from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import ShoeSelector from "./ShoeSelector";
import { haptic } from "@/lib/haptic";
import { ACTIVITY_TYPES, chooserPaceFor } from "./runConfigDefaults";
import type { ActivityType } from "@/types/run";
import type { PaceTable } from "@/lib/runPaces";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Footprints,
  PersonStanding,
  Zap,
  Route,
};

/** The four one-tap direct-launch types, in display order. Everything else
 *  (intervals / treadmill / guided / race) needs config → behind More. */
const DIRECT_TYPES: ActivityType[] = ["easy", "tempo", "long", "freerun"];

interface RunTilePickerProps {
  /** For the personalised pace band on each tile; null when no benchmark. */
  paceTable: PaceTable | null;
  selectedShoeId: string | null;
  onSelectShoe: (shoeId: string) => void;
  onPickType: (type: ActivityType) => void;
  onMoreOptions: () => void;
  onBack: () => void;
}

export default function RunTilePicker({
  paceTable,
  selectedShoeId,
  onSelectShoe,
  onPickType,
  onMoreOptions,
  onBack,
}: RunTilePickerProps) {
  const tiles = DIRECT_TYPES.map(
    (type) => ACTIVITY_TYPES.find((a) => a.type === type)!
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground px-4">
      <header className="flex items-center h-14 shrink-0">
        <IconButton
          aria-label="Back"
          variant="ghost"
          icon={<ArrowLeft className="size-5" />}
          onClick={onBack}
        />
        <h1 className="ml-1 text-lg font-bold">Start a run</h1>
      </header>

      <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((opt) => {
            const Icon = ICON_MAP[opt.icon] ?? Footprints;
            const band = chooserPaceFor(opt.type, paceTable);
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  haptic();
                  onPickType(opt.type);
                }}
                className="flex flex-col items-start gap-1 rounded-2xl bg-running/8 p-4 text-left min-h-[96px] active:scale-[0.97] transition-transform"
              >
                <div className="size-9 rounded-lg flex items-center justify-center bg-running/9">
                  <Icon className="size-5 text-running" />
                </div>
                <span className="text-sm font-bold mt-1">{opt.name}</span>
                <span className="text-micro text-muted-foreground">
                  {band ? (
                    <span className="font-mono tabular-nums">{band}</span>
                  ) : (
                    opt.cardDescription
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          fullWidth
          leftIcon={<SlidersHorizontal className="size-4" />}
          onClick={onMoreOptions}
        >
          More options
        </Button>

        <ShoeSelector selectedShoeId={selectedShoeId} onSelect={onSelectShoe} />
      </div>
    </div>
  );
}
