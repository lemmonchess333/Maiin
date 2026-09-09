import Button from "@/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Droplets, Plus, Minus, Check } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import IconButton from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";
import WaterSizeSheet from "@/components/home/WaterSizeSheet";
import {
  GLASS_ML,
  formatLitresValue,
  formatWaterVolume,
  waterProgress,
} from "@/lib/waterUnits";

/**
 * The reading, spoken. `formatWaterVolume` renders "2 L" / "250 ml",
 * whose units a screen reader pronounces as bare letters; MacroRing
 * spells "grams" for the same reason (MacroRing.tsx:51-60). Visual copy
 * keeps the symbols — only the accessible name uses this.
 */
function spokenVolume(ml: number): string {
  const label = formatWaterVolume(ml);
  return label.endsWith(" L")
    ? `${label.slice(0, -2)} litres`
    : `${label.slice(0, -3)} millilitres`;
}

/**
 * Water card (Water "B" millilitre model). Quick − / + repeat the last
 * container size (250 ml initially); tapping the card opens the size sheet
 * to log a real container (Glass / Bottle / Large / custom). The wave
 * fill + ripple identity is unchanged — only the underlying unit moved
 * from whole glasses to millilitres.
 */
export default function WaterCard({
  ml,
  targetMl,
  onLog,
  compact = false,
  servingMl = GLASS_ML,
  syncStatus,
  onRetry,
}: {
  /** Consumed millilitres today. */
  ml: number;
  /** Daily target in millilitres. */
  targetMl: number;
  /** Add (or remove, with a negative delta) millilitres. The hook
   *  clamps the running total at ≥ 0. */
  onLog: (deltaMl: number) => void | boolean;
  /** Pyramid tile variant: half-width cell beside the weight tile. */
  compact?: boolean;
  servingMl?: number;
  syncStatus?: string;
  onRetry?: () => void;
}) {
  const [rippleKey, setRippleKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  /* Announce the new TOTAL after a log, not the delta — the reading is
     otherwise unreachable to a screen reader (the card body is one
     button and its name is the whole tile). Gated on a ref rather than
     announced from `ml` directly, so a parent re-render or a value that
     arrives from elsewhere does not speak over the user. */
  const announce = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const fillPercent = waterProgress(ml, targetMl) * 100;
  const hasWater = ml > 0;
  /* `waterProgress` clamps at 1, so past the target every visual on this
     card freezes — 2 L and 7.25 L are pixel-identical. The full tile
     means "≥100%", a range with no upper bound, which collapses the one
     motivating moment on the card into the same picture as a day at
     three times the goal. `met` is a plain `>= 1`, NOT MacroRing's
     `done` BAND (0.9–1.1): a band would un-tick this card at 2.3 L while
     `hydration_hero` (badges.ts) had already awarded the day on
     `ml >= target`. Two surfaces disagreeing about the same day is the
     defect, not the rounding. */
  const met = targetMl > 0 && ml >= targetMl;
  /* Initialised to the CURRENT value, MacroRing's shape: Home remounts
     on every navigation back, so a ref seeded false would replay the
     completion haptic several times a day. */
  const wasMet = useRef(met);

  /* ONE sentence, two readers — the button's accessible name and the
     live region both take it, so they cannot drift apart. Past the
     target it carries the only thing that still varies on this card. */
  const reading =
    `Water ${spokenVolume(ml)} of ${spokenVolume(targetMl)}.` +
    (met ? " Target reached." : "") +
    (met && ml > targetMl ? ` ${spokenVolume(ml - targetMl)} over.` : "");

  useEffect(() => {
    const previous = wasMet.current;
    wasMet.current = met;
    if (!announce.current) return;
    announce.current = false;
    setAnnouncement(reading);
    /* One haptic per log, and this effect is its only owner — it is the
       only place that knows whether the tap crossed the target. Firing
       a light tap in `quickLog` as well would double-buzz that one log,
       which is what the crossing is for. (A log made through the size
       sheet keeps the sheet's own haptic and does not reach here.) */
    if (met && !previous) haptic("heavy");
    else haptic();
  }, [ml, targetMl, met, reading]);

  /* The haptic and the ripple are SUCCESS feedback, so they wait on the
     write. `onLog` returns false when the log is refused; the sheet path
     below already checked that return and the quick path did not, so a
     refused tap still buzzed and splashed as though it had landed. */
  function quickLog(deltaMl: number) {
    trackHomeEvent("home_card_tapped", { card: "water" });
    if (onLog(deltaMl) === false) return;
    announce.current = true;
    if (deltaMl > 0) setRippleKey((k) => k + 1);
  }
  function quickAdd() {
    quickLog(servingMl);
  }
  function quickRemove() {
    quickLog(-servingMl);
  }
  function openSheet() {
    haptic();
    trackHomeEvent("home_card_tapped", { card: "water" });
    setSheetOpen(true);
  }

  /* One treatment for both quick controls. They were asymmetric — minus
     carried `border border-teal/20 bg-teal/10`, plus a bare `bg-teal/15`
     with no edge — so a stepper pair read as two different KINDS of
     control.

     The surface is `bg-background`, not a teal tint, and that is what
     makes the pair survive a full tile. `waterProgress` clamps at 1, so
     a 362% day IS the 100% case: the fill covers the tile and its
     gradient is STRONGEST at the bottom (rgba(30,120,155,0.25) below) —
     exactly where these sit. Measured on that blended ground, a
     `bg-teal/10` disc is ~1.1:1, i.e. gone. An opaque page-surface disc
     is darker than BOTH tile surfaces in BOTH themes (light 93% L vs
     card 100% / muted 97.5%; dark 7% vs 13% / 17%), so it reads as a
     shallow well at 0% fill and punches out of the fill at 100%.

     The BORDER is load-bearing, not decoration: the disc's own fill is
     only ~1.21:1 against that ground at full fill, and the teal/30 edge
     is what defines the control. Do not drop it later.

     `hover:bg-teal/10` is required, not polish — IconButton's ghost
     variant supplies `hover:bg-muted`, which greys these on the web
     build, the surface this app is previewed on. */
  const quickControlClass =
    "rounded-full bg-background border border-teal/30 text-teal hover:bg-teal/10";

  const controls = (
    <div className="flex items-center gap-1 flex-shrink-0">
      <IconButton
        onClick={quickRemove}
        aria-label={`Remove ${servingMl} ml`}
        disabled={!hasWater}
        variant="ghost"
        className={quickControlClass}
        icon={<Minus className="size-4" />}
      />
      <IconButton
        onClick={quickAdd}
        aria-label={`Add ${servingMl} ml`}
        variant="ghost"
        className={quickControlClass}
        icon={<Plus className="size-4" />}
      />
    </div>
  );

  const sheet = sheetOpen && (
    <WaterSizeSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onLog={(v) => {
        const saved = onLog(v);
        if (saved !== false) setRippleKey((k) => k + 1);
        return saved;
      }}
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
        className="relative overflow-hidden p-3 rounded-xl bg-card h-full flex flex-col"
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
        <div className="relative z-10 flex flex-col flex-1">
          {/* Card body opens the size sheet (choose a container). */}
          {/* Focus ring + 0.97 press mirror the peer tile's button
              (WeightStepsTiles.tsx:124). This button had NO
              focus-visible styling at all, so keyboard focus on the
              water tile was invisible while focus on the weight tile
              beside it drew a ring. The ring sits 4px outside a 12px
              inset, so the tile's `overflow-hidden` does not clip it. */}
          <button
            type="button"
            onClick={openSheet}
            aria-label={`${reading} Add water — choose a container size.`}
            className="text-left rounded-lg motion-safe:active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="flex items-center gap-2 mb-1.5">
              {/* `bg-teal/10` / `text-teal`, not the raw
                  rgba(82,163,189,0.10) + inline hsl() this carried.
                  Those were theme-blind literals — the exact leak the
                  --teal token exists to close (src/index.css:92-98) —
                  where the peer tile uses THEME.iconBg. (The unit span's
                  inline hsl(var(--muted-foreground)) below STAYS: that
                  is the documented JS-context form, not a literal.) */}
              <div className="size-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal/10">
                <Droplets className="size-3.5 text-teal" aria-hidden="true" />
              </div>
              {/* SectionLabel, not a hand-rolled label: the weight tile
                  beside it uses the primitive, so this one rendered
                  "Water" in sentence case next to "WEIGHT" in the
                  canonical uppercase — the same peer-tile mismatch as the
                  numeral tier below, one line up. */}
              <SectionLabel>Water</SectionLabel>
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
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                / {formatWaterVolume(targetMl)}
              </span>
              {/* The completion cue the card had none of. Past the
                  target every other visual is frozen (the fill clamps
                  at 1), so without this a 362% day looks exactly like
                  hitting 2 L. A tick, not a colour change or a second
                  line: `items-stretch` on Home.tsx makes any height
                  change here resize the weight tile too. */}
              {met && (
                <Check
                  className="inline size-4 align-baseline text-teal"
                  aria-hidden="true"
                />
              )}
            </p>
          </button>
          {/* Row 3 — the compact-tile meta row, which water alone lacked.
              The weight tile spends this row on `lastWeightDate` at
              `text-micro mt-1` (WeightStepsTiles.tsx:174-179) and the
              steps tile on "today". Water had no row 3 at all: in its
              place sat `flex justify-end mt-auto pt-2`, a lone control
              cluster hard against the right edge while every other
              element in the tile sits on the 12px left axis.

              At 375px the inner tile is 143.5px and the controls are
              92px, so `justify-end` stranded ~47px of empty tile to
              their left — a third of the row. Giving the row a
              left-anchored element means there is no lone cluster left
              to read as off-centre, at any viewport; and unlike
              `justify-between` on a controls-only row, the gap does not
              GROW with width (the surplus goes to the label, not to dead
              space between two live buttons).

              It also puts `servingMl` on screen for the first time. It
              lived only in the aria-labels while useWaterLog silently
              resets it to the last container logged through the sheet —
              so a sighted user could tap + with no way to know whether
              they were adding 250 ml or 750 ml. aria-hidden because the
              two buttons already announce the same amount; unhidden it
              emits a stray orphan "250 ml" between them.

              `mt-auto` is gone on purpose: it pinned this row to the
              tile floor, which detaches the controls from the number
              they modify by up to 84px whenever the right column grows
              taller (native, steps tile present). Without it, surplus
              height falls BELOW row 3 in both tiles — the rule the peer
              states in code at WeightStepsTiles.tsx:139-141. */}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span
              aria-hidden="true"
              className="min-w-0 truncate text-micro text-muted-foreground font-mono tabular-nums"
            >
              {formatWaterVolume(servingMl)}
            </span>
            {controls}
          </div>
        </div>
        {/* Permanently mounted, sr-only when idle — the peer tile's shape
            (WeightStepsTiles.tsx:182-189). A live region inserted with
            its text already present is commonly not announced, so the
            old conditional mount meant NEITHER the sync line nor a
            quick log ever reached a screen reader. The retry control
            moved out: a button inside a live region is re-announced on
            every update. */}
        <span
          role="status"
          className={
            syncStatus
              ? "relative z-10 block text-micro text-muted-foreground mt-2"
              : "sr-only"
          }
        >
          {syncStatus || announcement}
        </span>
        {syncStatus && onRetry && (
          <Button variant="ghost" onClick={onRetry}>
            Retry sync
          </Button>
        )}
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
          className="flex items-center gap-4 flex-1 min-w-0 text-left motion-safe:active:scale-[0.99] transition-transform"
        >
          <div
            className="size-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(82, 163, 189, 0.10)" }}
          >
            <Droplets
              className="size-5"
              style={{ color: "hsl(var(--teal))" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <SectionLabel>Water</SectionLabel>
            <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
              {formatLitresValue(ml)}
              <span
                className="text-sm font-normal mx-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                / {formatWaterVolume(targetMl)}
              </span>
              {/* The completion cue the card had none of. Past the
                  target every other visual is frozen (the fill clamps
                  at 1), so without this a 362% day looks exactly like
                  hitting 2 L. A tick, not a colour change or a second
                  line: `items-stretch` on Home.tsx makes any height
                  change here resize the weight tile too. */}
              {met && (
                <Check
                  className="inline size-4 align-baseline text-teal"
                  aria-hidden="true"
                />
              )}
            </p>
          </div>
        </button>
        {controls}
      </div>
      {syncStatus && (
        <div
          role="status"
          className="relative z-10 text-micro text-muted-foreground mt-2"
        >
          {syncStatus}
          {onRetry && (
            <Button variant="ghost" onClick={onRetry}>
              Retry sync
            </Button>
          )}
        </div>
      )}
      {sheet}
    </div>
  );
}
