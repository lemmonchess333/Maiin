import type { CSSProperties, Ref } from "react";

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

export type ShareTemplate = "run" | "lift" | "hybrid" | "nutrition";
export type ShareFormat = "story" | "square";
export type ShareBackground = "brand" | "dark" | "transparent" | "photo";

const RUN_CORAL = "#D4637A";
const LIFT_PURPLE = "#7B72E9";
const NUTRITION_ORANGE = "#D9884E";
const ARCHIVO = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";
const JAKARTA = "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";

export interface ShareCardRenderData {
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
  pace?: string; // "5:12"
  elevationM?: number;
  splits?: { km: number; pace: string }[];

  // ── LIFT ──
  totalVolumeKg?: number;
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
}

const DIMS: Record<ShareFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

function bgStyle(background: ShareBackground, template: ShareTemplate): CSSProperties {
  switch (background) {
    case "brand":
      // Token gradient, sport-tinted by template (subtle, dark base so the
      // Archivo numerals pop). HYBRID gets the purple→coral signature.
      // Dark base throughout (never resolves light) so white numerals +
      // footer stay legible at every stop; sport tint stays subtle.
      return {
        backgroundImage:
          template === "run"
            ? `linear-gradient(155deg, #140a0e 0%, #21131a 55%, #301a24 100%)`
            : template === "lift"
              ? `linear-gradient(155deg, #100e1a 0%, #181428 55%, #221c38 100%)`
              : template === "nutrition"
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

function accentFor(template: ShareTemplate): string {
  if (template === "run") return RUN_CORAL;
  if (template === "nutrition") return NUTRITION_ORANGE;
  return LIFT_PURPLE;
}

function fmtDuration(sec?: number): string {
  if (sec == null) return "--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtVolume(kg?: number): string {
  if (!kg) return "0";
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
}

/** Small brand hexagon + upward-chevron, drawn inline (capture-safe). */
function HexMark({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" aria-hidden>
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

/** Hero stat: a big Archivo number + small uppercase label. */
function Hero({
  value,
  unit,
  label,
  color,
  scale,
}: {
  value: string;
  unit?: string;
  label: string;
  color: string;
  scale: number;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: ARCHIVO,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          fontSize: 220 * scale,
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
          textTransform: "uppercase",
          letterSpacing: 4 * scale,
          fontSize: 30 * scale,
          color: "rgba(255,255,255,0.55)",
          marginTop: 12 * scale,
        }}
      >
        {label}
      </div>
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
    ...bgStyle(data.background, data.template),
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
          <RunTemplate data={data} accent={accent} scale={scale} show={show} />
        )}
        {/* LIFT */}
        {data.template === "lift" && (
          <LiftTemplate data={data} accent={accent} scale={scale} show={show} />
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 48 * scale }}>
      {/* Abstract route polyline (default visual; empty → omitted) */}
      {data.routePath && (
        <div style={{ flex: data.format === "story" ? 1 : 0.6, display: "flex" }}>
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "100%" }}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 40 * scale }}>
        {show("distance") && (
          <Hero
            value={(data.distanceKm ?? 0).toFixed(2)}
            label="kilometres"
            color="#ffffff"
            scale={scale}
          />
        )}
        <div style={{ display: "flex", gap: 24 * scale }}>
          {show("pace") && <Stat value={data.pace ?? "--:--"} label="/km pace" scale={scale} color={accent} />}
          {show("duration") && <Stat value={fmtDuration(data.durationSec)} label="time" scale={scale} />}
          {show("elevation") && data.elevationM != null && (
            <Stat value={`${Math.round(data.elevationM)}m`} label="elev" scale={scale} />
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
                key={s.km}
                style={{
                  fontFamily: ARCHIVO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 28 * scale,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {s.km}k {s.pace}
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
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: 56 * scale,
      }}
    >
      {show("prs") && (data.prCount ?? 0) > 0 && (
        <div
          style={{
            alignSelf: "center",
            display: "flex",
            alignItems: "center",
            gap: 12 * scale,
            padding: `${12 * scale}px ${28 * scale}px`,
            borderRadius: 999,
            backgroundColor: `${accent}26`,
            color: accent,
            fontWeight: 700,
            fontSize: 32 * scale,
          }}
        >
          {data.prCount} PR{(data.prCount ?? 0) > 1 ? "s" : ""}
          {data.prExercise ? ` · ${data.prExercise}` : ""}
        </div>
      )}
      {show("volume") && (
        <Hero value={fmtVolume(data.totalVolumeKg)} label="total volume" color="#ffffff" scale={scale} />
      )}
      <div style={{ display: "flex", gap: 24 * scale }}>
        {show("exercises") && (
          <Stat value={String(data.exerciseCount ?? 0)} label="exercises" scale={scale} color={accent} />
        )}
        {show("duration") && <Stat value={fmtDuration(data.durationSec)} label="time" scale={scale} />}
      </div>
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32 * scale }}>
        {show("liftVolume") && (
          <Hero value={fmtVolume(data.totalVolumeKg)} label="lifted" color={LIFT_PURPLE} scale={scale * 0.62} />
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
            value={(data.distanceKm ?? 0).toFixed(1)}
            unit="km"
            label="ran"
            color={RUN_CORAL}
            scale={scale * 0.62}
          />
        )}
      </div>

      {show("totalTime") && (
        <div style={{ alignSelf: "center" }}>
          <Stat value={fmtDuration(data.durationSec)} label="total time" scale={scale} />
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
              ? `of ${Math.round(data.calorieTarget).toLocaleString()} kcal`
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
