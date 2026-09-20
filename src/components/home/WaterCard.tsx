import Button from "@/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Droplets, Plus, Minus } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import IconButton from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";
import WaterSizeSheet from "@/components/home/WaterSizeSheet";
import {
  GLASS_ML,
  formatWaterVolume,
  splitWaterVolume,
  waterProgress,
} from "@/lib/waterUnits";
import type { WaterDrink } from "@/lib/waterActions";

/** How long the tile offers to take the last drink back. Long enough to
 *  notice a mis-tap, short enough that the line is the step size again
 *  by the time you next look at the card. */
const UNDO_WINDOW_MS = 4000;

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
 * Water card (Water "B" millilitre model). The quick control repeats the
 * last container size (250 ml initially); tapping the card opens the size
 * sheet to log a real container (Glass / Bottle / Large / custom). The
 * full-width card keeps a − / + pair beside the reading. The compact tile
 * keeps ONE plus, in its label row; removal lives in the tile's own meta
 * line for a few seconds after a tap, and permanently in the sheet's log
 * of the day's drinks — see the tile for why. The wave fill + ripple
 * identity is unchanged — only the underlying unit moved from whole
 * glasses to millilitres.
 */
export default function WaterCard({
  ml,
  targetMl,
  onLog,
  compact = false,
  servingMl = GLASS_ML,
  syncStatus,
  onRetry,
  drinks,
  onRemoveDrink,
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
  /** Today's drinks, newest first — the sheet's log, and the source of
   *  the tile's undo affordance. */
  drinks?: WaterDrink[];
  /** Takes back the drink with this receipt id. */
  onRemoveDrink?: (id: string) => void | boolean;
}) {
  const [rippleKey, setRippleKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  /* The moment of the last add, or null. It only decides WHETHER the
     undo line shows; what it says comes from the newest drink at render
     time, so the line and the button can never name different drinks. */
  const [justLogged, setJustLogged] = useState<number | null>(null);
  /* Announce the new TOTAL after a log, not the delta — the reading is
     otherwise unreachable to a screen reader (the card body is one
     button and its name is the whole tile). Gated on a ref rather than
     announced from `ml` directly, so a parent re-render or a value that
     arrives from elsewhere does not speak over the user. */
  const announce = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  /* The undo window. A second tap restarts it rather than stacking a
     second anything — the whole point of moving this off a toast. */
  useEffect(() => {
    if (justLogged === null) return;
    const id = window.setTimeout(() => setJustLogged(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [justLogged]);
  const newestDrink = drinks?.[0];
  const showUndo = justLogged !== null && !!newestDrink && !!onRemoveDrink;

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
  /* Just what has been logged. The card used to read "… of 2 litres.
     Target reached." — the same out-of-N framing the visible number
     dropped, and a screen reader should not be told about a goal the
     screen no longer shows. */
  const reading = `Water ${spokenVolume(ml)} logged.`;

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
  function quickLog(deltaMl: number): boolean {
    trackHomeEvent("home_card_tapped", { card: "water" });
    if (onLog(deltaMl) === false) return false;
    announce.current = true;
    if (deltaMl > 0) setRippleKey((k) => k + 1);
    return true;
  }
  function quickAdd() {
    if (!quickLog(servingMl)) return;
    /* A refused log offers nothing, because there is nothing to undo. */
    if (compact && onRemoveDrink) setJustLogged(Date.now());
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

     NO FILL, and a SOLID teal edge. The previous pass gave these an
     opaque `bg-background` disc on the reasoning that a teal tint
     vanishes against a full tile — `waterProgress` clamps at 1, so a
     362% day covers the tile with a gradient strongest at the bottom
     (rgba(30,120,155,0.25)), exactly where these sit. The diagnosis was
     right and the cure was wrong: on the dark theme the page surface is
     #121214, so the pair read as two black holes punched through a teal
     card. Owner feedback, from a device: "the contrast looks weird…
     it's not high fidelity enough."
     
     Measured against the ground each disc actually sits on — the card
     at 0% fill and the card+gradient at 100%, both themes:

       fill: bg-background 1.16-1.49   bg-muted 1.06-1.33
             bg-card       1.00-1.41   teal/15  1.19-1.28

     Every candidate is invisible. The fill was never defining these
     controls, so the honest move is to drop it. The same measurement on
     the EDGE says the old teal/30 was not carrying them either
     (1.44-1.71); a solid `border-teal` is 4.04-6.08 across all four
     states, clearing the 3:1 that WCAG 1.4.11 asks of a control
     boundary. The teal glyph is 4.04-6.08 on the same grounds.

     `hover:bg-teal/10` is required, not polish — IconButton's ghost
     variant supplies `hover:bg-muted`, which greys these on the web
     build, the surface this app is previewed on. */
  const quickControlClass =
    "rounded-full border border-teal text-teal hover:bg-teal/10";

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
      /* Only the compact tile routes removal through the sheet; the
         full-width card has its minus beside the reading. */
      totalMl={compact ? ml : undefined}
      drinks={compact ? drinks : undefined}
      onRemoveDrink={compact ? onRemoveDrink : undefined}
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
        {/* No bubbles on the compact tile. It is 176x134 CSS px, the
            wave is already an ambient loop on this surface (DESIGN_GUIDE
            allows one), and 3-4px decorative dots at that size read as
            specks rather than as bubbles. The hero card below keeps
            them, where there is room for the effect to land. */}
        {/* ONE control on the tile, and it lives in the label row.

            Row 3 held two controls through four passes — two rings, then
            a label beside them, then one segmented stepper — and each
            read wrong from a device. The cause was never the alignment:
            two 44px targets plus anything else cannot share a 151px row,
            so every layout that tried was lopsided or a form field on a
            data tile. Owner call, from the options page: keep the plus,
            drop the minus.

            So the tile has Weight's three rows exactly — icon and label,
            the figure, a meta line — and the plus is a filled disc at the
            end of the label row, bookending the icon tile at the same
            32px. Its hit area is still 44px: the pseudo-element extends
            6px each side into the tile padding, which is empty. It sits
            OUTSIDE the body button because a button inside a button is
            invalid HTML, and above it because the body's hit area runs
            under the disc.

            Removal moved, not vanished: the tap's own toast carries Undo
            for this serving, and the size sheet gains a "Remove" row
            (only while there is something to remove). The full-width card
            keeps its − / + pair, so the design guide's "equal minus/plus"
            line now names that card only. */}
        <IconButton
          onClick={quickAdd}
          aria-label={`Add ${servingMl} ml`}
          size="sm"
          className="absolute top-3 right-3 z-20 size-8 rounded-full bg-teal text-teal-foreground hover:bg-teal/90 before:absolute before:-inset-1.5 before:content-['']"
          icon={<Plus className="size-4" />}
        />
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
            <div className="flex items-center gap-2 mb-1.5 pr-10">
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
              {splitWaterVolume(ml).value}
              <span
                className="text-sm font-normal ml-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {splitWaterVolume(ml).unit}
              </span>
            </p>
            {/* The meta line, where Weight keeps its date. At rest it
                names the step: `servingMl` follows the last container
                logged, so a sighted user must be able to see whether the
                plus means 250 ml or 750.

                For a few seconds after a tap it becomes the way back
                instead. That used to be a toast, and before that the
                minus button this tile no longer has. The toast was the
                wrong shape and the hook said so before it was written:
                "a 5-second overlay covering the surface below is a real
                cost for the most repeated, most trivially reversible
                action in the app" — and four taps stacked four of them.
                The line is already here, already this height, and covers
                nothing; the permanent version of the same job is the
                sheet's log.

                It names the newest drink RATHER than what was just
                logged, and the button takes back that same drink, so the
                two cannot disagree — no captured amount to go stale. */}
            {!showUndo && (
              <p
                className="text-micro mt-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Tap + for {formatWaterVolume(servingMl)}
              </p>
            )}
          </button>
          {/* Outside the body button, for the reason the plus is: a
              button inside a button is invalid HTML. Same tier, same
              `mt-1`, and only ever one of the two renders, so the tile
              does not change height when it swaps — the grid stretches
              the weight tile beside it, and a jump there on the most
              repeated action in the app is exactly what the sync line
              was kept out of the layout to avoid.

              The hit area is widened by a pseudo-element rather than by
              padding, for the same reason: padding would grow the row.
              It is under the 44px floor, deliberately — a transient
              affordance whose permanent, full-size equivalent is the
              sheet's log, one tap away on the same tile. */}
          {showUndo && newestDrink && (
            <p className="text-micro mt-1 flex items-center gap-2 text-foreground">
              <span className="font-medium">
                +{formatWaterVolume(newestDrink.ml)}
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  /* The live region is keyed on the total, so the new
                     total speaks itself once the removal lands. Without
                     this a screen-reader user hears nothing back. */
                  announce.current = true;
                  onRemoveDrink?.(newestDrink.id);
                  setJustLogged(null);
                }}
                aria-label={`Undo ${formatWaterVolume(newestDrink.ml)}`}
                className="relative font-semibold text-teal rounded before:absolute before:-inset-2 before:content-[''] active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Undo
              </button>
            </p>
          )}
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
              {splitWaterVolume(ml).value}
              <span
                className="text-sm font-normal ml-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {splitWaterVolume(ml).unit}
              </span>
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
