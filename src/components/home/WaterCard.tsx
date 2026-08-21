import { useState } from "react";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Droplets, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";
import WaterSizeSheet from "@/components/home/WaterSizeSheet";
import {
  GLASS_ML,
  formatLitresValue,
  formatVolume,
  waterProgress,
} from "@/lib/waterUnits";

/**
 * Water card (Water "B" millilitre model). Quick − / + step one 250 ml
 * glass for repeat-logging; tapping the card body opens the size sheet
 * to log a real container (Glass / Bottle / Large / custom). The wave
 * fill + ripple identity is unchanged — only the underlying unit moved
 * from whole glasses to millilitres.
 */
export default function WaterCard({
  ml,
  targetMl,
  onLog,
  compact = false,
}: {
  /** Consumed millilitres today. */
  ml: number;
  /** Daily target in millilitres. */
  targetMl: number;
  /** Add (or remove, with a negative delta) millilitres. The hook
   *  clamps the running total at ≥ 0. */
  onLog: (deltaMl: number) => void;
  /** Pyramid tile variant: half-width cell beside the weight tile. */
  compact?: boolean;
}) {
  const [rippleKey, setRippleKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fillPercent = waterProgress(ml, targetMl) * 100;
  const hasWater = ml > 0;

  function quickAdd() {
    haptic();
    trackHomeEvent("home_card_tapped", { card: "water" });
    onLog(GLASS_ML);
    setRippleKey((k) => k + 1);
  }
  function quickRemove() {
    haptic();
    trackHomeEvent("home_card_tapped", { card: "water" });
    onLog(-GLASS_ML);
  }
  function openSheet() {
    haptic();
    trackHomeEvent("home_card_tapped", { card: "water" });
    setSheetOpen(true);
  }

  const sheet = (
    <WaterSizeSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onLog={(v) => {
        onLog(v);
        setRippleKey((k) => k + 1);
      }}
      consumedMl={ml}
      targetMl={targetMl}
    />
  );

  const iconBoxShadow = hasWater
    ? "var(--ds-shadow-card), inset 0 -4px 12px rgba(82, 163, 189, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)"
    : "var(--ds-shadow-card)";
  const fillBg = hasWater
    ? "linear-gradient(0deg, rgba(30, 120, 155, 0.25) 0%, rgba(58, 153, 186, 0.15) 40%, rgba(82, 163, 189, 0.08) 100%)"
    : "transparent";

  if (compact) {
    return (
      <div
        className="relative overflow-hidden p-3 rounded-xl bg-card h-full"
        style={{ boxShadow: iconBoxShadow }}
      >
        <motion.div
          className="absolute inset-x-0 bottom-0 pointer-events-none rounded-xl"
          style={{ background: fillBg }}
          initial={{ height: 0 }}
          animate={{ height: fillPercent + "%" }}
          transition={{ type: "spring", stiffness: 120, damping: 14 }}
        >
          {hasWater && (
            <WaterWave fillPercent={fillPercent} splash={rippleKey} />
          )}
        </motion.div>
        {ml > 2 * GLASS_ML && <WaterBubbles />}
        <div className="relative z-10 flex flex-col h-full">
          {/* Card body opens the size sheet (choose a container). */}
          <button
            type="button"
            onClick={openSheet}
            aria-label="Add water — choose a container size"
            className="text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="size-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(82, 163, 189, 0.10)" }}
              >
                <Droplets
                  className="size-3.5"
                  style={{ color: THEME.semantic.hydration }}
                />
              </div>
              <p
                className="text-xs font-medium"
                style={{ color: THEME.text.muted }}
              >
                Water
              </p>
            </div>
            {/* Matches the weight tile beside it, which is the canonical
                compact-tile numeral treatment (text-2xl / 800, unit at
                text-sm). This variant sat a full tier below it —
                text-xl / 700 with a text-xs unit — so two tiles of equal
                rank, in the same row, read as different ranks, and the
                pair broke DESIGN_GUIDE's "never mix 700 and 800 in the
                same visual tier". The non-compact variant below already
                uses this treatment, so the compact one was the outlier
                inside its own component too. */}
            <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
              {formatLitresValue(ml)}
              <span
                className="text-sm font-normal mx-1"
                style={{ color: THEME.text.muted }}
              >
                / {formatVolume(targetMl)}
              </span>
            </p>
          </button>
          <div className="flex items-center justify-end gap-1.5 mt-auto pt-2">
            <button
              type="button"
              onClick={quickRemove}
              aria-label="Remove a glass (250 ml)"
              disabled={!hasWater}
              className={cn(
                "size-11 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0 border",
                !hasWater && "opacity-30"
              )}
              style={{
                backgroundColor: THEME.iconBg,
                borderColor: THEME.semantic.hydration + "30",
              }}
            >
              <Minus
                className="size-4"
                style={{ color: THEME.semantic.hydration }}
              />
            </button>
            <button
              type="button"
              onClick={quickAdd}
              aria-label="Add a glass (250 ml)"
              className="size-11 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0"
              style={{
                backgroundColor: THEME.semantic.hydration + "26",
                borderColor: "transparent",
              }}
            >
              <Plus
                className="size-4"
                style={{ color: THEME.semantic.hydration }}
              />
            </button>
          </div>
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden p-4 rounded-2xl bg-card"
      style={{ boxShadow: iconBoxShadow }}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 pointer-events-none rounded-2xl"
        style={{ background: fillBg }}
        initial={{ height: 0 }}
        animate={{ height: fillPercent + "%" }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      >
        {hasWater && <WaterWave fillPercent={fillPercent} splash={rippleKey} />}
      </motion.div>
      {ml > 2 * GLASS_ML && <WaterBubbles />}
      <div className="relative z-10 flex items-center gap-4">
        {/* Left cluster (icon + reading) opens the size sheet. */}
        <button
          type="button"
          onClick={openSheet}
          aria-label="Add water — choose a container size"
          className="flex items-center gap-4 flex-1 min-w-0 text-left active:scale-[0.99] transition-transform"
        >
          <div
            className="size-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(82, 163, 189, 0.10)" }}
          >
            <Droplets
              className="size-5"
              style={{ color: THEME.semantic.hydration }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-medium"
              style={{ color: THEME.text.muted }}
            >
              Water
            </p>
            <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
              {formatLitresValue(ml)}
              <span
                className="text-sm font-normal mx-1"
                style={{ color: THEME.text.muted }}
              >
                / {formatVolume(targetMl)}
              </span>
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={quickRemove}
            aria-label="Remove a glass (250 ml)"
            disabled={!hasWater}
            className={cn(
              "size-12 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0 border",
              !hasWater && "opacity-30"
            )}
            style={{
              backgroundColor: THEME.iconBg,
              borderColor: THEME.semantic.hydration + "30",
            }}
          >
            <Minus
              className="size-4"
              style={{ color: THEME.semantic.hydration }}
            />
          </button>
          <button
            type="button"
            onClick={quickAdd}
            aria-label="Add a glass (250 ml)"
            className="size-12 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0"
            style={{
              backgroundColor: THEME.semantic.hydration + "26",
              borderColor: "transparent",
            }}
          >
            <Plus
              className="size-4"
              style={{ color: THEME.semantic.hydration }}
            />
          </button>
        </div>
      </div>
      {sheet}
    </div>
  );
}
