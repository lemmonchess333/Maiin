import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Droplets } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import WaterContainerIcon, {
  type WaterContainerType,
} from "@/components/home/WaterContainerIcon";
import {
  WATER_PRESETS,
  MAX_SINGLE_LOG_ML,
  clampMl,
  formatVolume,
} from "@/lib/waterUnits";

// Glyph scales up with the container so the visual reinforces volume.
const PRESET_ICON_SIZE: Record<string, number> = {
  glass: 32,
  bottle: 40,
  large: 46,
};

/**
 * Water size picker (Water "B" model) — tap a container to log its
 * volume in one tap, or enter a custom amount. Opened from the water
 * card body; the quick − / + on the card cover repeat-logging the
 * default glass, this sheet is for choosing a real container.
 *
 * Logs + closes on select (single-tap intent). Reuses the shared
 * BottomSheet primitive so back/escape/backdrop dismissal + keyboard
 * inset handling come for free.
 */
export default function WaterSizeSheet({
  open,
  onClose,
  onLog,
  consumedMl,
  targetMl,
}: {
  open: boolean;
  onClose: () => void;
  onLog: (ml: number) => void;
  consumedMl: number;
  targetMl: number;
}) {
  const [custom, setCustom] = useState("");

  function log(ml: number) {
    const v = clampMl(ml);
    if (v <= 0) return;
    haptic();
    onLog(v);
    setCustom("");
    onClose();
  }

  const customMl = clampMl(Number(custom));
  const customValid = customMl > 0 && customMl <= MAX_SINGLE_LOG_ML;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add water"
      description="Pick a container size or enter a custom amount"
    >
      <div className="px-5 pb-6 pt-4 space-y-4">
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

        {/* Running total against target */}
        <div className="flex items-center gap-3">
          <div
            className="size-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(82, 163, 189, 0.10)" }}
          >
            <Droplets
              className="size-5"
              style={{ color: THEME.semantic.hydration }}
            />
          </div>
          <div className="min-w-0">
            <p
              className="text-xs font-medium"
              style={{ color: THEME.text.muted }}
            >
              Water today
            </p>
            <p className="text-lg font-bold leading-tight text-foreground font-mono tabular-nums">
              {formatVolume(consumedMl)}
              <span
                className="text-sm font-normal ml-1"
                style={{ color: THEME.text.muted }}
              >
                / {formatVolume(targetMl)}
              </span>
            </p>
          </div>
        </div>

        {/* Preset containers */}
        <div className="grid grid-cols-3 gap-2">
          {WATER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => log(preset.ml)}
              className="flex flex-col items-center justify-center gap-1.5 min-h-[104px] rounded-xl border active:scale-[0.97] transition-transform"
              style={{
                backgroundColor: THEME.semantic.hydration + "12",
                borderColor: THEME.semantic.hydration + "26",
              }}
            >
              <span className="flex h-12 items-end justify-center">
                <WaterContainerIcon
                  type={preset.id as WaterContainerType}
                  size={PRESET_ICON_SIZE[preset.id] ?? 26}
                />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {preset.label}
              </span>
              <span
                className="text-micro font-mono tabular-nums"
                style={{ color: THEME.text.muted }}
              >
                {preset.ml} ml
              </span>
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SINGLE_LOG_ML}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom"
              aria-label="Custom amount in millilitres"
              className="w-full h-11 rounded-xl bg-muted px-3 pr-10 text-sm text-foreground font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: THEME.text.muted }}
            >
              ml
            </span>
          </div>
          <button
            type="button"
            onClick={() => customValid && log(customMl)}
            disabled={!customValid}
            className={cn(
              "h-11 px-4 rounded-xl text-sm font-semibold text-white active:scale-[0.97] transition-transform",
              !customValid && "opacity-40"
            )}
            style={{ backgroundColor: THEME.semantic.hydration }}
          >
            Add
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
