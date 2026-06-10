import { useState, type CSSProperties, type ReactNode } from "react";
import CalorieRing from "@/components/food/CalorieRing";
import { THEME } from "@/lib/theme";

/*
 * DEV/TEST-ONLY brand bake-off (not in production builds — see App.tsx).
 * Renders comparison candidates for: (1) hero-numeral typeface, (2) hexagon
 * vs circle calorie ring, (3) app icon. Capture-only; nothing here ships.
 *
 * Candidate fonts are imported HERE so they live in this route's chunk and
 * never load in production (the route + this module are stripped from the
 * prod build). woff2 is self-hosted via fontsource (works offline in the rig).
 */
import "@fontsource-variable/archivo/standard.css"; // wght + wdth (B, B2)
import "@fontsource/barlow-semi-condensed/800.css"; // static 800 (C)
import "@fontsource-variable/bricolage-grotesque/wght.css"; // wght (D)

// ── Experiment 1: hero-numeral typeface candidates ──────────────────────────
interface FontVariant {
  id: string;
  label: string;
  family: string;
  /** font-variation-settings string, or "normal". */
  variation: string;
  /** Bundle note: latin woff2 that would actually ship. */
  bundle: string;
}
const FONT_VARIANTS: FontVariant[] = [
  {
    id: "A",
    label: "A · Control — JetBrains Mono 800",
    family: "var(--font-mono)",
    variation: "normal",
    bundle: "0 KB added (already shipping)",
  },
  {
    id: "B",
    label: "B · Archivo 800",
    family: "'Archivo Variable'",
    variation: '"wght" 800',
    bundle: "~34.9 KB (wght-only build)",
  },
  {
    id: "B2",
    label: "B2 · Archivo 800 · Expanded (wdth 125)",
    family: "'Archivo Variable'",
    variation: '"wght" 800, "wdth" 125',
    bundle: "~90.1 KB (wght+wdth multi-axis build)",
  },
  {
    id: "C",
    label: "C · Barlow Semi Condensed 800",
    family: "'Barlow Semi Condensed'",
    variation: "normal",
    bundle: "~23.2 KB (static 800)",
  },
  {
    id: "D",
    label: "D · Bricolage Grotesque 800",
    family: "'Bricolage Grotesque Variable'",
    variation: '"wght" 800',
    bundle: "~41.3 KB (wght-only build)",
  },
];

/** Per-variant numeral-font wrapper. The scoped rule (below) repaints every
 *  `.font-mono` descendant in the variant font with tabular figures forced. */
function NumFontScope({
  v,
  children,
}: {
  v: FontVariant;
  children: ReactNode;
}) {
  return (
    <div
      className="bk-numfont"
      style={{ "--bk-fam": v.family, "--bk-var": v.variation } as CSSProperties}
    >
      {children}
    </div>
  );
}

const SCOPED_STYLE = `
.bk-numfont .font-mono {
  font-family: var(--bk-fam) !important;
  font-variation-settings: var(--bk-var, normal);
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
}
`;

// ── Surface replicas (faithful: same classes / sizes / colours / values as
//    the live Food, Home and RunDetail surfaces). ────────────────────────────

/** Surface 2 — Today's Energy intake row ("1,310 / 2,200 kcal"). */
function TodayEnergyRow() {
  return (
    <div className="rounded-2xl bg-card p-4 w-[300px]">
      <p className="text-xs font-semibold text-muted-foreground mb-2">
        Today's Energy
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
          1,310
        </span>
        <span className="text-micro text-muted-foreground font-mono tabular-nums">
          / 2,200 kcal
        </span>
      </div>
      <div className="relative h-2 mt-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: "60%", background: THEME.semantic.nutrition }}
        />
      </div>
    </div>
  );
}

/** Surface 3 — RunDetail stat cards (36:10 / 5:50 / 380). */
function RunStatCards() {
  const cells: [string, string, string | undefined][] = [
    ["36:10", "Time", undefined],
    ["5:50", "/km Pace", THEME.teal],
    ["380", "Cal", THEME.warning],
  ];
  return (
    <div className="rounded-2xl bg-card shadow-sm flex divide-x divide-border/40 w-[300px]">
      {cells.map(([value, label, color]) => (
        <div key={label} className="flex-1 text-center py-3 px-2">
          <p
            className="text-2xl font-bold font-mono tabular-nums leading-none"
            style={{ color: color || "var(--foreground)" }}
          >
            {value}
          </p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Tabular-figure proof: 1111 over 8888 at hero size. The capture script
 *  measures both rows' widths; unequal width = proportional digits = FAIL. */
function TabularCheck({ vid }: { vid: string }) {
  return (
    <div className="text-center">
      <p
        data-tnum={`${vid}-1`}
        className="text-4xl font-extrabold font-mono tabular-nums leading-none text-foreground inline-block"
      >
        1111
      </p>
      <br />
      <p
        data-tnum={`${vid}-8`}
        className="text-4xl font-extrabold font-mono tabular-nums leading-none text-foreground inline-block"
      >
        8888
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">
        tnum check
      </p>
    </div>
  );
}

function FontSurfaceSheet({
  surface,
  render,
}: {
  surface: string;
  render: () => ReactNode;
}) {
  return (
    <div data-shot={`font-${surface}`} className="bg-background p-4 space-y-4">
      <h3 className="text-h3 font-bold text-foreground">{surface}</h3>
      {FONT_VARIANTS.map((v) => (
        <div key={v.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{v.label}</p>
            <p className="text-[10px] text-muted-foreground">{v.bundle}</p>
          </div>
          <NumFontScope v={v}>
            <div className="flex items-center gap-4">
              {render()}
              <TabularCheck vid={`${surface}-${v.id}`} />
            </div>
          </NumFontScope>
        </div>
      ))}
    </div>
  );
}

// Experiment 2 (hexagon vs circle calorie ring) was REJECTED — the hexagon's
// partial-fill legibility lost to the circle. HexCalorieRing has been deleted;
// the captures + docs/visual-audit/bakeoff/DECISION.md are the permanent record.

// ── Experiment 3: app icon candidates ───────────────────────────────────────
// All derive from the canonical hexagon-chevron geometry (src/assets/brand).
const FIELD = THEME.brand; // flat brand purple (#7B72E9)
const FIELD_GRADIENT = `linear-gradient(180deg, ${THEME.brand} 0%, ${THEME.brandStrong} 100%)`;
const HEX_PTS = "50,8 88,29 88,71 50,92 12,71 12,29"; // pointy-top, padded
const CHEV = "36,58 50,42 66,58";

type IconKind = "stroke" | "cutout" | "chevron" | "dumbbell";
function IconMark({ kind, px }: { kind: IconKind; px: number }) {
  // Stroke weight scales with size but is floored so it survives at 29px.
  const sw = Math.max(4, Math.round(px * 0.06));
  const swView = (sw / px) * 100; // back to the 100-viewBox space
  return (
    <svg viewBox="0 0 100 100" width={px} height={px} aria-hidden="true">
      {kind === "stroke" && (
        <>
          <polygon
            points={HEX_PTS}
            fill="none"
            stroke="#fff"
            strokeWidth={swView}
            strokeLinejoin="round"
          />
          <polyline
            points={CHEV}
            fill="none"
            stroke="#fff"
            strokeWidth={swView}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "cutout" && (
        <>
          <polygon points={HEX_PTS} fill="#fff" />
          {/* chevron in the field colour = negative-space read */}
          <polyline
            points={CHEV}
            fill="none"
            stroke={FIELD}
            strokeWidth={swView * 1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "chevron" && (
        <polyline
          points="28,62 50,36 72,62"
          fill="none"
          stroke="#fff"
          strokeWidth={swView * 1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {kind === "dumbbell" && (
        <g
          stroke="#fff"
          strokeWidth={swView * 1.2}
          strokeLinecap="round"
          fill="#fff"
        >
          <line x1="30" y1="50" x2="70" y2="50" stroke="#fff" />
          <rect x="18" y="40" width="10" height="20" rx="3" stroke="none" />
          <rect x="72" y="40" width="10" height="20" rx="3" stroke="none" />
          <rect
            x="10"
            y="44"
            width="6"
            height="12"
            rx="2"
            stroke="none"
            opacity={0.75}
          />
          <rect
            x="84"
            y="44"
            width="6"
            height="12"
            rx="2"
            stroke="none"
            opacity={0.75}
          />
        </g>
      )}
    </svg>
  );
}

function IconTile({
  kind,
  px,
  gradient,
}: {
  kind: IconKind;
  px: number;
  gradient?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          width: px,
          height: px,
          borderRadius: Math.round(px * 0.22), // iOS squircle-ish
          background: gradient ? FIELD_GRADIENT : FIELD,
        }}
      >
        <IconMark kind={kind} px={Math.round(px * 0.6)} />
      </div>
      <span className="text-[9px] text-muted-foreground tabular-nums">
        {px}px
      </span>
    </div>
  );
}

const ICON_CANDIDATES: { id: string; kind: IconKind; label: string }[] = [
  { id: "A", kind: "stroke", label: "A · Stroke hexagon-chevron" },
  { id: "B", kind: "cutout", label: "B · Solid hex, chevron cutout" },
  { id: "C", kind: "chevron", label: "C · Chevron alone" },
  { id: "D", kind: "dumbbell", label: "D · Current dumbbell (control)" },
];
// Home-screen-critical sizes (fit the 393px sheet). 120 = home @3x shape,
// 60 = spotlight/settings, 29 = notifications — the legibility floor.
const ICON_SIZES = [120, 60, 29];

function IconSheet() {
  return (
    <div data-shot="icon-sheet" className="bg-background p-4 space-y-5">
      {ICON_CANDIDATES.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-xs font-semibold text-foreground">{c.label}</p>
          {/* light wallpaper row — flat field */}
          <div className="flex items-end gap-3 p-3 rounded-xl bg-neutral-200">
            {ICON_SIZES.map((px) => (
              <IconTile key={`l-${px}`} kind={c.kind} px={px} />
            ))}
          </div>
          {/* dark wallpaper row — 120 shows the restrained 2-stop gradient
              variant; 60/29 stay flat for the legibility read */}
          <div className="flex items-end gap-3 p-3 rounded-xl bg-neutral-800">
            <IconTile kind={c.kind} px={120} gradient />
            <IconTile kind={c.kind} px={60} />
            <IconTile kind={c.kind} px={29} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BrandBakeoff() {
  const [section, setSection] = useState<"fonts" | "icon">("fonts");
  return (
    <div className="min-h-screen bg-background px-4 py-6 space-y-6">
      <style>{SCOPED_STYLE}</style>
      <header>
        <h1 className="text-h1 font-extrabold text-foreground">
          Brand bake-off
        </h1>
        <p className="text-sm text-muted-foreground">
          Dev-only comparison harness — nothing here ships.
        </p>
        <div className="flex gap-2 mt-3">
          {(["fonts", "icon"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`px-3 min-h-[44px] rounded-xl text-sm font-semibold ${
                section === s
                  ? "bg-primary-strong text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {section === "fonts" && (
        <div className="space-y-8">
          <FontSurfaceSheet
            surface="foodring"
            render={() => (
              <CalorieRing
                consumed={890}
                target={2200}
                mode="left"
                onToggleMode={() => {}}
                trajectoryLabel={null}
                ringDurationMs={0}
              />
            )}
          />
          <FontSurfaceSheet
            surface="todayenergy"
            render={() => <TodayEnergyRow />}
          />
          <FontSurfaceSheet
            surface="runstats"
            render={() => <RunStatCards />}
          />
        </div>
      )}

      {section === "icon" && <IconSheet />}
    </div>
  );
}
