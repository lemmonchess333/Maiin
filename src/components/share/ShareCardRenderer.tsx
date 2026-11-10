import type { CSSProperties, Ref } from "react";
// The display register's wide heavy italic (DESIGN_GUIDE §4): the card's
// hero figure is set in it, as the finish screen sets its one figure.
import "@fontsource-variable/archivo/wdth-italic.css";
import { formatClock, formatDuration } from "@/utils/formatters";
import {
  distanceUnitLabel,
  elevationUnitLabel,
  paceUnitLabel,
  spokenDistanceUnit,
  type DistanceUnit,
} from "@/lib/distanceUnits";
import { paceMinSec, distanceValue, elevationLabel } from "@/lib/runLabels";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { liftVolumeIn, type LiftUnit } from "@/lib/liftLoad";
import { workFigure } from "@/lib/liftFigures";
import { THEME } from "@/lib/theme";
import type { FinishTone } from "@/lib/finishMoment";

/** `12.3km` — the compact no-space form this card's small stats use. */
function distanceLabel2Compact(km: number | undefined, unit: DistanceUnit) {
  return `${distanceValue((km ?? 0) * 1000, unit)}${distanceUnitLabel(unit)}`;
}

/** `120m` — the same compact variant for a climb. The shared
 *  `elevationLabel` is spaced like the rest of the app; this card's
 *  documented exemption is the space-constrained rasterised layout, so it
 *  writes its own form here exactly as it already does for distance. */
function elevationLabelCompact(metres: number, unit: DistanceUnit) {
  return `${elevationLabel(metres, unit, false)}${elevationUnitLabel(unit)}`;
}

/**
 * ShareCardRenderer (SOCIAL S1, PR2) — the pixel-perfect, offscreen DOM
 * surface that html-to-image rasterises into a share image.
 *
 * Design constraints (DESIGN_GUIDE §branding is binding):
 *  - Archivo numerals are the typographic HERO (the big stat number).
 *  - Branding is a SMALL hexagon mark in a corner + the user's handle —
 *    NEVER an oversized wordmark (this replaces the old ShareCard's giant
 *    "TROPOS" header, which violated that rule).
 *  - Closed palette: RUN = coral (#D4637A), LIFT = purple (#7B72E9),
 *    HYBRID = the purple→coral gradient (the differentiator no competitor
 *    has).
 *
 * Everything is INLINE-STYLED on purpose: (1) html-to-image clones the
 * DOM and its CSS-variable / Tailwind-class resolution during the clone
 * is unreliable (the old ShareCard already documents this) — inline is
 * capture-safe; (2) it makes the component self-contained so the
 * visual-audit rig can render it with no app CSS.
 *
 * This component is render-only. Computing the route path
 * (buildRoutePath), toggle state (statToggles), rasterisation
 * (shareCardGenerator) and entry wiring live elsewhere.
 */

export type ShareTemplate = "run" | "lift" | "hybrid" | "nutrition" | "recap";
export type ShareFormat = "story" | "square";
export type ShareBackground = "brand" | "dark" | "transparent" | "photo";

const RUN_CORAL = "#D4637A";
const LIFT_PURPLE = "#7B72E9";
const NUTRITION_ORANGE = "#D9884E";
/** Gold means a new best and nothing else (§14b): the tier gold, as the
 *  recap's streak already draws it. */
const ACHIEVEMENT_GOLD = THEME.tier.gold;
/** The card's stage: the app's own dark page (§14m rule 31), never a
 *  field of colour. */
const STAGE = THEME.bg;
/** The card's words, white on its dark stage. */
const INK = "#ffffff";
const ARCHIVO = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";
const JAKARTA =
  "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";

export interface ShareCardRenderData {
  /**
   * The SHARER's unit, not the viewer's.
   *
   * This is the one place in the app where "the reader's unit" is genuinely
   * ambiguous, because a share card is an IMAGE that other people look at
   * and the image is fixed at export. Rendering it in the sharer's unit is
   * what every running app does and what the numbers mean to the person
   * posting them — the alternative would be a card whose units depend on
   * who happens to open it, which a PNG cannot do anyway.
   */
  unit: DistanceUnit;
  /** The SHARER's lifting unit (Lift18), for the same reason. Kg when
   *  missing. */
  liftUnit?: LiftUnit;
  template: ShareTemplate;
  format: ShareFormat;
  background: ShareBackground;
  /** User handle (displayName) shown next to the hexagon mark. */
  handle: string;
  /** Pre-formatted date string. */
  date: string;
  /** Hidden stat keys (eye-toggle state). Empty = show all. */
  hiddenStats?: ReadonlySet<string>;
  /** Photo background source (background === "photo"). */
  photoUrl?: string;

  // ── RUN ──
  /** SVG path `d` from buildRoutePath (abstract route line). Empty/absent
   *  → no route drawn (manual run / route toggle off), stats stand alone. */
  routePath?: string;
  distanceKm?: number;
  durationSec?: number;
  /** Seconds per KILOMETRE — the stored convention. Formatted at render in
   *  `unit`, because a pre-formatted string cannot be converted. */
  paceSecPerKm?: number;
  elevationM?: number;
  /** `lap` is the split's ORDINAL and the pace is sec/km; both render in
   *  `unit`. Named `lap` rather than `km` because for an imperial sharer
   *  the rows are miles. */
  splits?: { lap: number; paceSecPerKm: number }[];

  // ── THE FINISH (DS4) ──
  /** The session done, as the finish screen heads it ("Pull A done"). */
  headline?: string;
  /** The reward's one sentence (`rewardLine`), when the session earned
   *  one. */
  line?: string;
  /** The achievement's colour: gold for a new best, the sport's for a
   *  first, the flame's purple for a streak. Absent, the sport's. */
  tone?: FinishTone;
  /** The session's drawing (a lift's main lift), same-origin. */
  artSrc?: string;

  // ── LIFT ──
  totalVolumeKg?: number;
  /** The session's working reps (`sessionWork`), so a bodyweight session
   *  reads as its reps rather than "0 kg lifted" (`workFigure`). */
  totalReps?: number;
  exerciseCount?: number;
  prCount?: number;
  prExercise?: string; // PR callout headline

  // ── HYBRID reuses totalVolumeKg + distanceKm + durationSec ──

  // ── NUTRITION (macro-day card) ──
  calories?: number;
  calorieTarget?: number;
  protein?: number;
  carbs?: number;
  fat?: number;

  // ── RECAP (weekly summary; reuses distanceKm + totalVolumeKg as WEEK
  //    totals rather than a single session's) ──
  sessionsCount?: number;
  streakDays?: number;
}

const DIMS: Record<ShareFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

function bgStyle(
  background: ShareBackground,
  template: ShareTemplate,
  meaning: string
): CSSProperties {
  switch (background) {
    case "brand":
      // DS4 (§14m rules 13, 14, 31): the app's dark stage with one soft
      // light of the session's meaning colour behind its picture, fading
      // into the page. A run is coral and a lift purple, as everywhere in
      // the app; a new best is gold. Nutrition and the hybrid and recap
      // cards keep their own washes.
      if (template === "run" || template === "lift")
        return {
          backgroundColor: STAGE,
          backgroundImage: `radial-gradient(ellipse 72% 40% at 50% ${template === "lift" ? 30 : 32}%, ${meaning}5c 0%, ${meaning}24 45%, ${meaning}00 100%)`,
        };
      return {
        backgroundImage:
          template === "nutrition"
            ? `linear-gradient(155deg, #15100a 0%, #221a10 55%, #33260f 100%)`
            : `linear-gradient(155deg, #130f1a 0%, #1b1430 55%, #2a1a26 100%)`,
      };
    case "dark":
      return { backgroundColor: "#0a0a0f" };
    case "transparent":
      return { backgroundColor: "transparent" };
    case "photo":
      return { backgroundColor: "#0a0a0f" };
  }
}

/** The colour the card's data wears: the achievement's, else the sport's
 *  (purple lifting, coral running; never crossed). */
function meaningFor(data: ShareCardRenderData): string {
  if (data.tone === "achievement") return ACHIEVEMENT_GOLD;
  if (data.tone === "running") return RUN_CORAL;
  if (data.tone === "lifting") return LIFT_PURPLE;
  if (data.template === "run") return RUN_CORAL;
  if (data.template === "nutrition") return NUTRITION_ORANGE;
  return LIFT_PURPLE;
}

function accentFor(template: ShareTemplate): string {
  if (template === "nutrition") return NUTRITION_ORANGE;
  return LIFT_PURPLE;
}

function fmtDuration(sec?: number): string {
  return sec == null ? "--" : formatClock(sec);
}

function fmtVolume(kg?: number, liftUnit: LiftUnit = "kg"): string {
  if (!kg) return "0";
  if (liftUnit === "lbs") {
    // No lb counterpart to the tonne, so thousands read "27.1k lb".
    const lb = liftVolumeIn(kg, liftUnit);
    return lb >= 1000
      ? `${(lb / 1000).toFixed(1)}k lb`
      : `${Math.round(lb)} lb`;
  }
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
}

/** Small brand hexagon + upward-chevron, drawn inline (capture-safe). */
function HexMark({ size, color }: { size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      aria-hidden
    >
      <polygon
        points="50,6 89,28 89,72 50,94 11,72 11,28"
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <polyline
        points="35,57 50,41 65,57"
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Hero stat: a big Archivo number + small uppercase label. `display`
 *  sets it in the display register's wide heavy italic, its label in
 *  sentence case, as the finish screen sets its one figure. */
function Hero({
  value,
  unit,
  label,
  color,
  scale,
  display = false,
}: {
  value: string;
  unit?: string;
  label: string;
  color: string;
  scale: number;
  display?: boolean;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: ARCHIVO,
          fontWeight: display ? 900 : 800,
          ...(display ? { fontStyle: "italic", fontStretch: "125%" } : {}),
          fontVariantNumeric: "tabular-nums",
          fontSize: (display && value.length > 5 ? 180 : 220) * scale,
          lineHeight: 0.92,
          color,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 12 * scale,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 64 * scale, fontWeight: 700, color }}>
            {unit}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: JAKARTA,
          fontWeight: 600,
          ...(display
            ? { fontSize: 40 * scale }
            : {
                textTransform: "uppercase" as const,
                letterSpacing: 4 * scale,
                fontSize: 30 * scale,
              }),
          color: "rgba(255,255,255,0.6)",
          marginTop: 12 * scale,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** The session done ("Pull A done"), over the hero figure. */
function Headline({ text, scale }: { text: string; scale: number }) {
  return (
    <div
      style={{
        alignSelf: "center",
        textAlign: "center",
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 58 * scale,
        lineHeight: 1.15,
        color: INK,
      }}
    >
      {text}
    </div>
  );
}

/** The reward's one sentence, under the figure, ruled in its colour. */
function RewardSentence({
  text,
  color,
  scale,
}: {
  text: string;
  color: string;
  scale: number;
}) {
  return (
    <div
      style={{
        alignSelf: "center",
        textAlign: "center",
        maxWidth: 840 * scale,
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 44 * scale,
        lineHeight: 1.3,
        color: INK,
        borderTop: `${4 * scale}px solid ${color}`,
        paddingTop: 28 * scale,
      }}
    >
      {text}
    </div>
  );
}

/** Secondary stat in the bottom row. */
function Stat({
  value,
  label,
  scale,
  color = "#ffffff",
}: {
  value: string;
  label: string;
  scale: number;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div
        style={{
          fontFamily: ARCHIVO,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          fontSize: 72 * scale,
          lineHeight: 1,
          color,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: JAKARTA,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 2 * scale,
          fontSize: 24 * scale,
          color: "rgba(255,255,255,0.5)",
          marginTop: 8 * scale,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ShareCardRenderer({
  data,
  offscreen = true,
  ref,
}: {
  data: ShareCardRenderData;
  /** Position offscreen for in-app rasterisation (default). The rig sets
   *  this false to render it in view for screenshotting. */
  offscreen?: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const { w, h } = DIMS[data.format];
  // Square is tighter than story; scale type down a touch.
  const scale = data.format === "story" ? 1 : 0.82;
  const accent = accentFor(data.template);
  const meaning = meaningFor(data);
  const hidden = data.hiddenStats ?? new Set<string>();
  const show = (k: string) => !hidden.has(k);

  const container: CSSProperties = {
    width: w,
    height: h,
    boxSizing: "border-box",
    overflow: "hidden",
    position: offscreen ? "absolute" : "relative",
    ...(offscreen ? { left: -99999, top: -99999 } : {}),
    display: "flex",
    flexDirection: "column",
    padding: 80 * scale,
    color: "#ffffff",
    fontFamily: JAKARTA,
    ...bgStyle(data.background, data.template, meaning),
  };

  return (
    <div ref={ref} style={container}>
      {/* Photo background layer + scrim */}
      {data.background === "photo" && data.photoUrl && (
        <>
          <img
            src={data.photoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.75) 100%)",
            }}
          />
        </>
      )}

      {/* Content sits above the photo layers */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* RUN */}
        {data.template === "run" && (
          <RunTemplate data={data} accent={meaning} scale={scale} show={show} />
        )}
        {/* LIFT */}
        {data.template === "lift" && (
          <LiftTemplate
            data={data}
            accent={meaning}
            scale={scale}
            show={show}
          />
        )}
        {/* HYBRID */}
        {data.template === "hybrid" && (
          <HybridTemplate data={data} scale={scale} show={show} />
        )}
        {/* NUTRITION */}
        {data.template === "nutrition" && (
          <NutritionTemplate
            data={data}
            accent={accent}
            scale={scale}
            show={show}
          />
        )}
        {/* RECAP */}
        {data.template === "recap" && (
          <RecapTemplate data={data} scale={scale} show={show} />
        )}

        {/* Footer: small hexagon mark + handle + date (the ONLY branding) */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 16 * scale,
          }}
        >
          <HexMark size={44 * scale} color={accent} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 700, fontSize: 30 * scale }}>
              {data.handle}
            </span>
            <span
              style={{
                fontSize: 24 * scale,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {data.date}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Weekly recap — the WHOOP-style "your week" card. Sessions is the hero;
 *  the run/lift totals wear their sport colours; streak wears gold. Uses the
 *  hybrid gradient (a week is the hybrid story by definition). */
function RecapTemplate({
  data,
  scale,
  show,
}: {
  data: ShareCardRenderData;
  scale: number;
  show: (k: string) => boolean;
}) {
  const GOLD = "#FFD700"; // THEME.tier.gold, duplicated capture-safe like the sport hexes
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: 64 * scale,
      }}
    >
      <div
        style={{
          alignSelf: "center",
          fontFamily: JAKARTA,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 6 * scale,
          fontSize: 34 * scale,
          backgroundImage: `linear-gradient(90deg, ${LIFT_PURPLE}, ${RUN_CORAL})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        This week
      </div>
      {show("sessions") && (
        <Hero
          value={`${data.sessionsCount ?? 0}`}
          label={data.sessionsCount === 1 ? "session" : "sessions"}
          color="#ffffff"
          scale={scale}
        />
      )}
      <div style={{ display: "flex", gap: 24 * scale }}>
        {show("runDistance") && (
          <Stat
            value={distanceLabel2Compact(data.distanceKm, data.unit)}
            label="run"
            scale={scale}
            color={RUN_CORAL}
          />
        )}
        {show("liftVolume") && (
          <Stat
            value={fmtVolume(data.totalVolumeKg, data.liftUnit)}
            label="lifted"
            scale={scale}
            color={LIFT_PURPLE}
          />
        )}
        {show("streak") && (data.streakDays ?? 0) > 0 && (
          <Stat
            value={`${data.streakDays}d`}
            label="streak"
            scale={scale}
            color={GOLD}
          />
        )}
      </div>
    </div>
  );
}

function RunTemplate({
  data,
  accent,
  scale,
  show,
}: {
  data: ShareCardRenderData;
  accent: string;
  scale: number;
  show: (k: string) => boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 48 * scale,
      }}
    >
      {/* Abstract route polyline (default visual; empty → omitted).
          The svg is ABSOLUTE inside a relative flex box, deliberately: a
          percentage-sized svg with a viewBox contributes its intrinsic
          1000px height to flex sizing in WebKit, which inflated the route
          box until the square card's stats overflowed the canvas (the
          hero number rendered half-cropped on a real device, 2026-08-09).
          Absolute positioning takes the svg out of intrinsic sizing, so
          the route always fits whatever space the stats leave over — in
          both formats and both engines. */}
      {data.routePath && (
        <div
          style={{
            flex: data.format === "story" ? 1 : 0.6,
            position: "relative",
            minHeight: 140 * scale,
          }}
        >
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
            aria-hidden
          >
            <path
              d={data.routePath}
              fill="none"
              stroke={accent}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 40 * scale }}
      >
        {data.headline && <Headline text={data.headline} scale={scale} />}
        {show("distance") && (
          <Hero
            value={distanceValue((data.distanceKm ?? 0) * 1000, data.unit, 2)}
            label={spokenDistanceUnit(data.unit, 2)}
            color="#ffffff"
            scale={scale}
            display
          />
        )}
        {data.line && (
          <RewardSentence text={data.line} color={accent} scale={scale} />
        )}
        <div style={{ display: "flex", gap: 24 * scale }}>
          {show("pace") && (
            <Stat
              value={
                data.paceSecPerKm
                  ? paceMinSec(data.paceSecPerKm, data.unit)
                  : "--:--"
              }
              label={`${paceUnitLabel(data.unit)} pace`}
              scale={scale}
            />
          )}
          {show("duration") && (
            <Stat
              value={fmtDuration(data.durationSec)}
              label="time"
              scale={scale}
            />
          )}
          {show("elevation") && data.elevationM != null && (
            <Stat
              value={elevationLabelCompact(data.elevationM, data.unit)}
              label="elev"
              scale={scale}
            />
          )}
        </div>
        {show("splits") && data.splits && data.splits.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 16 * scale,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {data.splits.slice(0, 6).map((s) => (
              <span
                key={s.lap}
                style={{
                  fontFamily: ARCHIVO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 28 * scale,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {s.lap}
                {distanceUnitLabel(data.unit)}{" "}
                {paceMinSec(s.paceSecPerKm, data.unit)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiftTemplate({
  data,
  accent,
  scale,
  show,
}: {
  data: ShareCardRenderData;
  accent: string;
  scale: number;
  show: (k: string) => boolean;
}) {
  // DS4: the session's drawing in its light, the session done, one hero
  // figure in the display register, and the reward's sentence when it
  // earned one. Without a sentence, a new best still says so in gold.
  const liftUnit = data.liftUnit ?? "kg";
  // The finish screen's own figure: kg (or lb) lifted, or a bodyweight
  // session's reps.
  const work = workFigure(
    data.totalVolumeKg ?? 0,
    data.totalReps ?? 0,
    liftUnit
  );
  // "in 41 min", as the finish screen's caption says it.
  const time =
    show("duration") && data.durationSec
      ? ` in ${formatDuration(data.durationSec)}`
      : "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: 44 * scale,
      }}
    >
      {data.artSrc && (
        <div
          style={{
            flex: data.format === "story" ? 1 : 0.8,
            position: "relative",
            minHeight: 220 * scale,
          }}
        >
          <img
            src={data.artSrc}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      )}
      {data.headline && <Headline text={data.headline} scale={scale} />}
      {show("volume") && (
        <Hero
          value={Math.round(work.to).toLocaleString("en-GB")}
          label={`${work.unit}${time}`}
          color="#ffffff"
          scale={scale}
          display
        />
      )}
      {data.line ? (
        <RewardSentence text={data.line} color={accent} scale={scale} />
      ) : (
        show("prs") &&
        (data.prCount ?? 0) > 0 && (
          <div
            style={{
              alignSelf: "center",
              display: "flex",
              alignItems: "center",
              gap: 12 * scale,
              padding: `${12 * scale}px ${28 * scale}px`,
              borderRadius: 999,
              backgroundColor: `${ACHIEVEMENT_GOLD}26`,
              color: ACHIEVEMENT_GOLD,
              fontWeight: 700,
              fontSize: 32 * scale,
            }}
          >
            {data.prCount} PR{(data.prCount ?? 0) > 1 ? "s" : ""}
            {data.prExercise ? ` · ${data.prExercise}` : ""}
          </div>
        )
      )}
      {/* The steps down from the figure: the exercises, and the time when
          the figure that carries it is hidden. */}
      {(show("exercises") || (show("duration") && !show("volume"))) && (
        <div style={{ display: "flex", gap: 24 * scale }}>
          {show("exercises") && (
            <Stat
              value={String(data.exerciseCount ?? 0)}
              label="exercises"
              scale={scale}
            />
          )}
          {show("duration") && !show("volume") && (
            <Stat
              value={fmtDuration(data.durationSec)}
              label="time"
              scale={scale}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HybridTemplate({
  data,
  scale,
  show,
}: {
  data: ShareCardRenderData;
  scale: number;
  show: (k: string) => boolean;
}) {
  // The differentiator: lift volume + run distance + total time, with the
  // purple→coral signature gradient binding the two disciplines together.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: 48 * scale,
      }}
    >
      <div
        style={{
          alignSelf: "center",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 4 * scale,
          fontSize: 30 * scale,
          backgroundImage: `linear-gradient(90deg, ${LIFT_PURPLE}, ${RUN_CORAL})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Lift + Run
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32 * scale,
        }}
      >
        {show("liftVolume") && (
          <Hero
            value={fmtVolume(data.totalVolumeKg, data.liftUnit)}
            label="lifted"
            color={LIFT_PURPLE}
            scale={scale * 0.62}
          />
        )}
        <div
          style={{
            width: 6 * scale,
            alignSelf: "stretch",
            margin: `${24 * scale}px 0`,
            borderRadius: 999,
            backgroundImage: `linear-gradient(180deg, ${LIFT_PURPLE}, ${RUN_CORAL})`,
          }}
        />
        {show("runDistance") && (
          <Hero
            value={distanceValue((data.distanceKm ?? 0) * 1000, data.unit)}
            unit={distanceUnitLabel(data.unit)}
            label="ran"
            color={RUN_CORAL}
            scale={scale * 0.62}
          />
        )}
      </div>

      {show("totalTime") && (
        <div style={{ alignSelf: "center" }}>
          <Stat
            value={fmtDuration(data.durationSec)}
            label="total time"
            scale={scale}
          />
        </div>
      )}
    </div>
  );
}

function NutritionTemplate({
  data,
  accent,
  scale,
  show,
}: {
  data: ShareCardRenderData;
  accent: string;
  scale: number;
  show: (k: string) => boolean;
}) {
  // Minimal macro-day card (S2): calories hero + a P/C/F line. Orange is
  // the nutrition identity. One glanceable card, not a dashboard.
  const macroLine = [
    `${Math.round(data.protein ?? 0)}P`,
    `${Math.round(data.carbs ?? 0)}C`,
    `${Math.round(data.fat ?? 0)}F`,
  ].join("  ·  ");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: 40 * scale,
      }}
    >
      {show("calories") && (
        <Hero
          value={Math.round(data.calories ?? 0).toLocaleString()}
          label={
            data.calorieTarget
              ? `of ${Math.round(data.calorieTarget).toLocaleString()} ${CALORIE_UNIT}`
              : "kcal"
          }
          color="#ffffff"
          scale={scale}
        />
      )}
      {show("macros") && (
        <div
          style={{
            alignSelf: "center",
            fontFamily: ARCHIVO,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            fontSize: 56 * scale,
            color: accent,
            letterSpacing: 1 * scale,
          }}
        >
          {macroLine}
        </div>
      )}
    </div>
  );
}

export default ShareCardRenderer;
