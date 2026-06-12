/* eslint-disable no-restricted-syntax -- THROWAWAY prototype: the whole point
   is to explore premium colour/material treatments OUTSIDE the THEME token set,
   so hardcoded hex in inline styles is intentional here. This file is
   dev/preview-only and deleted once a direction is picked; it never ships. */
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  THROWAWAY PROTOTYPE — Home screen "100x" visual exploration           ║
 * ║                                                                        ║
 * ║  Three radically different PREMIUM directions for the Tropos Home      ║
 * ║  screen, switchable live so a direction can be picked from the web     ║
 * ║  preview. This is NOT production code — it is self-contained (no       ║
 * ║  Firebase, no auth, mock data, no app imports beyond React Router) so  ║
 * ║  it can't break on refactors and is trivial to delete once a           ║
 * ║  direction is chosen.                                                  ║
 * ║                                                                        ║
 * ║  Route:  /proto-home   (also /proto-home?v=2&mode=dark)                ║
 * ║  Switch: floating bottom bar — variant 1/2/3 + light/dark toggle.      ║
 * ║                                                                        ║
 * ║  Directions (deliberately wide range — allowed OUTSIDE the current     ║
 * ║  calm/restrained spec):                                                ║
 * ║   1. Calm-luxe     — Oura / Things: depth, materials, impeccable type, ║
 * ║                      restrained colour, signature micro-motion.        ║
 * ║   2. Bold-expressive — NRC / Strava×Arc: confident colour, big         ║
 * ║                      expressive type, energetic motion, data-as-hero.  ║
 * ║   3. Tech-precise   — Linear / Whoop: dense, sharp, dark-forward,      ║
 * ║                      precise grid, monospace data.                     ║
 * ║                                                                        ║
 * ║  Non-negotiables kept: light + dark, 44px touch targets, iOS feel.     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { useSearchParams } from "react-router-dom";

type Mode = "light" | "dark";

// ─────────────────────────────────────────────────────────────────────────
// Mock content — the same realistic Home data feeds all three variants so
// they're a fair visual comparison.
// ─────────────────────────────────────────────────────────────────────────
type WeekDay = {
  d: string;
  date: number;
  lift: boolean;
  run: boolean;
  done: boolean;
  today?: boolean;
};
const WEEK: WeekDay[] = [
  { d: "M", date: 8, lift: true, run: false, done: true },
  { d: "T", date: 9, lift: false, run: true, done: true },
  { d: "W", date: 10, lift: true, run: false, done: true },
  { d: "T", date: 11, lift: false, run: false, done: false },
  { d: "F", date: 12, lift: true, run: true, done: false, today: true },
  { d: "S", date: 13, lift: false, run: true, done: false },
  { d: "S", date: 14, lift: false, run: false, done: false },
];
const DATA = {
  name: "Myles",
  greeting: "Friday",
  dateLong: "12 June",
  week: WEEK,
  healthScore: 82,
  performance: 74,
  calories: { eaten: 1840, target: 2400 },
  water: { ml: 1600, target: 2500 },
  weight: { kg: 78.4, deltaKg: -0.6 },
  steps: 7240,
  energy: { burned: 2380, net: -540 },
  today: {
    title: "Push Day",
    sub: "Chest · Shoulders · Triceps",
    meta: "6 exercises · ~52 min",
    run: "Easy 5K · Zone 2",
  },
} as const;

const fmt = (n: number) => n.toLocaleString("en-GB");

// ═════════════════════════════════════════════════════════════════════════
// Shared tiny SVG ring (each variant styles stroke/size/glow differently).
// ═════════════════════════════════════════════════════════════════════════
function Ring({
  pct,
  size,
  stroke,
  track,
  color,
  glow,
  children,
}: {
  pct: number;
  size: number;
  stroke: number;
  track: string;
  color: string;
  glow?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{
            transition: "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)",
            filter: glow ? `drop-shadow(0 0 8px ${glow})` : undefined,
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT 1 — CALM-LUXE  (Oura / Things)
// ═════════════════════════════════════════════════════════════════════════
function CalmLuxe({ mode }: { mode: Mode }) {
  const dark = mode === "dark";
  const t = dark
    ? {
        bg: "linear-gradient(180deg,#15151A 0%,#101013 100%)",
        card: "rgba(255,255,255,0.045)",
        cardBorder: "rgba(255,255,255,0.07)",
        text: "#ECECF1",
        sub: "rgba(255,255,255,0.50)",
        hair: "rgba(255,255,255,0.07)",
        shadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.8)",
      }
    : {
        bg: "linear-gradient(180deg,#FBFAF7 0%,#F4F2EE 100%)",
        card: "#FFFFFF",
        cardBorder: "rgba(0,0,0,0.04)",
        text: "#1C1B22",
        sub: "#8A8896",
        hair: "rgba(0,0,0,0.06)",
        shadow:
          "0 1px 2px rgba(28,27,34,0.04), 0 20px 40px -28px rgba(28,27,34,0.28)",
      };
  const brand = "#7B72E9";
  const coral = "#D4637A";

  const card: React.CSSProperties = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 24,
    boxShadow: t.shadow,
    backdropFilter: dark ? "blur(12px)" : undefined,
  };

  return (
    <div
      style={{
        background: t.bg,
        color: t.text,
        minHeight: "100%",
        paddingBottom: 120,
      }}
    >
      <div style={{ padding: "22px 20px 0" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Hex size={34} />
            <div>
              <div
                style={{ fontSize: 19, fontWeight: 600, letterSpacing: -0.3 }}
              >
                Good evening, {DATA.name}
              </div>
              <div style={{ fontSize: 13, color: t.sub, marginTop: 1 }}>
                {DATA.greeting} · {DATA.dateLong}
              </div>
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: dark ? "rgba(255,255,255,0.06)" : "#fff",
              border: `1px solid ${t.cardBorder}`,
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            M
          </div>
        </div>

        {/* Week — hairline, restrained */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 22,
            padding: "4px 2px",
          }}
        >
          {DATA.week.map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: t.sub, letterSpacing: 0.4 }}>
                {w.d}
              </span>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 14,
                  fontWeight: w.today ? 700 : 500,
                  fontVariantNumeric: "tabular-nums",
                  color: w.today ? "#fff" : t.text,
                  background: w.today ? brand : "transparent",
                  border: w.today ? "none" : `1px solid ${t.hair}`,
                  boxShadow: w.today ? `0 8px 18px -6px ${brand}88` : "none",
                }}
              >
                {w.date}
              </div>
              <div style={{ display: "flex", gap: 3, height: 5 }}>
                {w.lift && <Dot c={brand} done={w.done} />}
                {w.run && <Dot c={coral} done={w.done} />}
                {!w.lift && !w.run && <span style={{ width: 5 }} />}
              </div>
            </div>
          ))}
        </div>

        {/* Hero — Health Score, the calm centrepiece */}
        <div
          style={{
            ...card,
            marginTop: 22,
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          <Ring
            pct={DATA.healthScore}
            size={120}
            stroke={9}
            track={dark ? "rgba(255,255,255,0.07)" : "#EEECF6"}
            color={brand}
            glow={dark ? `${brand}66` : undefined}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: -1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {DATA.healthScore}
            </div>
            <div
              style={{
                fontSize: 10,
                color: t.sub,
                letterSpacing: 1.4,
                textTransform: "uppercase",
              }}
            >
              Score
            </div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: t.sub,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              Today's readiness
            </div>
            <div
              style={{
                fontSize: 21,
                fontWeight: 600,
                letterSpacing: -0.4,
                marginTop: 6,
                lineHeight: 1.25,
              }}
            >
              You're primed. A strong day to push.
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
              <Mini
                label="Performance"
                value={`${DATA.performance}`}
                sub="index"
                color={t.sub}
                text={t.text}
              />
              <span style={{ width: 1, background: t.hair }} />
              <Mini
                label="Steps"
                value={fmt(DATA.steps)}
                sub="today"
                color={t.sub}
                text={t.text}
              />
            </div>
          </div>
        </div>

        {/* Two stat tiles — calories + water */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div style={{ ...card, padding: 18 }}>
            <div
              style={{
                fontSize: 11,
                color: t.sub,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Calories
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(DATA.calories.eaten)}
              </span>
              <span style={{ fontSize: 13, color: t.sub }}>
                / {fmt(DATA.calories.target)}
              </span>
            </div>
            <Bar
              pct={(DATA.calories.eaten / DATA.calories.target) * 100}
              c="#D9884E"
              track={t.hair}
            />
          </div>
          <div style={{ ...card, padding: 18 }}>
            <div
              style={{
                fontSize: 11,
                color: t.sub,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Water
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {(DATA.water.ml / 1000).toFixed(1)}
              </span>
              <span style={{ fontSize: 13, color: t.sub }}>
                / {(DATA.water.target / 1000).toFixed(1)}L
              </span>
            </div>
            <Bar
              pct={(DATA.water.ml / DATA.water.target) * 100}
              c="#52A3BD"
              track={t.hair}
            />
          </div>
        </div>

        {/* Today's session — the calm CTA */}
        <div
          style={{
            ...card,
            marginTop: 12,
            padding: 20,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -40,
              top: -40,
              width: 160,
              height: 160,
              borderRadius: 999,
              background: `radial-gradient(circle,${brand}22,transparent 70%)`,
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: t.sub,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Today · Lift + Run
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: -0.5,
              marginTop: 8,
            }}
          >
            {DATA.today.title}
          </div>
          <div style={{ fontSize: 14, color: t.sub, marginTop: 3 }}>
            {DATA.today.sub}
          </div>
          <div style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>
            {DATA.today.meta}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 16,
                border: "none",
                background: brand,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                boxShadow: `0 12px 24px -10px ${brand}aa`,
              }}
            >
              Start workout
            </button>
            <button
              style={{
                minHeight: 48,
                padding: "0 18px",
                borderRadius: 16,
                border: `1px solid ${coral}55`,
                background: `${coral}14`,
                color: coral,
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              + Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT 2 — BOLD-EXPRESSIVE  (Nike Run Club / Strava × Arc)
// ═════════════════════════════════════════════════════════════════════════
function BoldExpressive({ mode }: { mode: Mode }) {
  const dark = mode === "dark";
  const t = dark
    ? {
        bg: "#0C0B10",
        text: "#FFFFFF",
        sub: "rgba(255,255,255,0.55)",
        card: "#17151F",
        hair: "rgba(255,255,255,0.08)",
      }
    : {
        bg: "#F5F4F9",
        text: "#100E1A",
        sub: "#6B6878",
        card: "#FFFFFF",
        hair: "rgba(0,0,0,0.06)",
      };
  const brand = "#7B72E9";
  const coral = "#D4637A";
  const gPurple = "linear-gradient(135deg,#9590E0 0%,#7B72E9 55%,#6560C8 100%)";
  const gCoral = "linear-gradient(135deg,#E08A9B 0%,#D4637A 60%,#B84A63 100%)";

  return (
    <div
      style={{
        background: t.bg,
        color: t.text,
        minHeight: "100%",
        paddingBottom: 120,
      }}
    >
      <style>{`@keyframes panP{0%{background-position:0% 50%}100%{background-position:100% 50%}}`}</style>
      <div style={{ padding: "24px 18px 0" }}>
        {/* Header — oversized greeting */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: coral,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              {DATA.greeting} · {DATA.dateLong}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: -1.6,
                lineHeight: 1.02,
                marginTop: 4,
              }}
            >
              Let's move,
              <br />
              {DATA.name}.
            </div>
          </div>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: gPurple,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              boxShadow: `0 10px 24px -8px ${brand}`,
            }}
          >
            M
          </div>
        </div>

        {/* Week — chunky chips */}
        <div
          style={{
            display: "flex",
            gap: 7,
            marginTop: 22,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {DATA.week.map((w, i) => (
            <div
              key={i}
              style={{
                minWidth: 46,
                flex: 1,
                borderRadius: 16,
                padding: "10px 0",
                textAlign: "center",
                background: w.today ? gPurple : t.card,
                border: w.today ? "none" : `1px solid ${t.hair}`,
                color: w.today ? "#fff" : t.text,
                boxShadow: w.today ? `0 12px 26px -10px ${brand}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  opacity: w.today ? 0.9 : 0.5,
                  letterSpacing: 0.5,
                }}
              >
                {w.d}
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 2,
                }}
              >
                {w.date}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 3,
                  justifyContent: "center",
                  marginTop: 5,
                  height: 6,
                }}
              >
                {w.lift && <Dot c={w.today ? "#fff" : brand} done={w.done} />}
                {w.run && <Dot c={w.today ? "#fff" : coral} done={w.done} />}
              </div>
            </div>
          ))}
        </div>

        {/* HERO — today's session as a full-bleed gradient, data-as-hero */}
        <div
          style={{
            marginTop: 20,
            borderRadius: 28,
            padding: 22,
            position: "relative",
            overflow: "hidden",
            background: gPurple,
            backgroundSize: "180% 180%",
            animation: "panP 9s ease-in-out infinite alternate",
            color: "#fff",
            boxShadow: `0 26px 50px -20px ${brand}cc`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            Today's session
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: -1.4,
              marginTop: 8,
              lineHeight: 1,
            }}
          >
            {DATA.today.title}
          </div>
          <div
            style={{
              fontSize: 15,
              opacity: 0.9,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            {DATA.today.sub}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
            {DATA.today.meta}
          </div>
          <button
            style={{
              marginTop: 18,
              minHeight: 52,
              width: "100%",
              borderRadius: 18,
              border: "none",
              background: "#fff",
              color: brand,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: -0.2,
            }}
          >
            ▶ Start now
          </button>
        </div>

        {/* Big-number stat row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 14,
          }}
        >
          <BoldStat
            label="Health"
            value={`${DATA.healthScore}`}
            accent={brand}
            t={t}
            foot="Readiness — strong"
          />
          <BoldStat
            label="Perform"
            value={`${DATA.performance}`}
            accent={coral}
            t={t}
            foot="↑ 6 this week"
          />
        </div>

        {/* Energy banner — coral, expressive */}
        <div
          style={{
            marginTop: 12,
            borderRadius: 22,
            padding: 18,
            background: gCoral,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: `0 20px 40px -18px ${coral}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              Energy balance
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: -1,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {DATA.energy.net} kcal
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>
              {fmt(DATA.calories.eaten)} in · {fmt(DATA.energy.burned)} out
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              textAlign: "right",
              opacity: 0.9,
              lineHeight: 1.4,
            }}
          >
            On track
            <br />
            for a deficit
          </div>
        </div>

        {/* Water + weight quick tiles */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.hair}`,
              borderRadius: 20,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#52A3BD",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Water
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: -0.8,
                marginTop: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {(DATA.water.ml / 1000).toFixed(1)}L
            </div>
            <Bar
              pct={(DATA.water.ml / DATA.water.target) * 100}
              c="#52A3BD"
              track={t.hair}
            />
          </div>
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.hair}`,
              borderRadius: 20,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: brand,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Weight
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: -0.8,
                marginTop: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {DATA.weight.kg}
              <span style={{ fontSize: 14, fontWeight: 600 }}> kg</span>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#4DB872",
                marginTop: 6,
              }}
            >
              {DATA.weight.deltaKg} kg this week
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT 3 — TECH-PRECISE  (Linear / Whoop)
// ═════════════════════════════════════════════════════════════════════════
function TechPrecise({ mode }: { mode: Mode }) {
  const dark = mode === "dark";
  const t = dark
    ? {
        bg: "#08090C",
        panel: "#0E1014",
        text: "#E6E8EC",
        sub: "rgba(230,232,236,0.42)",
        line: "rgba(255,255,255,0.08)",
        gridLine: "rgba(255,255,255,0.04)",
      }
    : {
        bg: "#F1F2F4",
        panel: "#FFFFFF",
        text: "#0B0C0E",
        sub: "#6A6E76",
        line: "rgba(0,0,0,0.10)",
        gridLine: "rgba(0,0,0,0.045)",
      };
  const brand = "#7B72E9";
  const coral = "#D4637A";
  const green = "#4DB872";
  const mono = "ui-monospace,SFMono-Regular,Menlo,monospace";

  const panel: React.CSSProperties = {
    background: t.panel,
    border: `1px solid ${t.line}`,
    borderRadius: 12,
  };
  const eyebrow: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: t.sub,
  };

  return (
    <div
      style={{
        background: t.bg,
        color: t.text,
        minHeight: "100%",
        paddingBottom: 120,
        backgroundImage: `linear-gradient(${t.gridLine} 1px,transparent 1px),linear-gradient(90deg,${t.gridLine} 1px,transparent 1px)`,
        backgroundSize: "26px 26px",
      }}
    >
      <div style={{ padding: "20px 14px 0" }}>
        {/* Header — instrument bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hex size={28} />
            <div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                TROPOS
              </div>
              <div style={{ ...eyebrow, marginTop: 1 }}>
                {DATA.greeting} 12.06 · {DATA.name}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ ...eyebrow, color: green }}>● LIVE</span>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                display: "grid",
                placeItems: "center",
                fontFamily: mono,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              M
            </div>
          </div>
        </div>

        {/* Week — tight grid cells */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7,1fr)",
            gap: 5,
            marginTop: 18,
          }}
        >
          {DATA.week.map((w, i) => (
            <div
              key={i}
              style={{
                ...panel,
                padding: "7px 0 6px",
                textAlign: "center",
                borderColor: w.today ? brand : t.line,
                background: w.today ? `${brand}14` : t.panel,
              }}
            >
              <div style={{ ...eyebrow, fontSize: 9 }}>{w.d}</div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 15,
                  fontWeight: 600,
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(w.date).padStart(2, "0")}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  justifyContent: "center",
                  marginTop: 4,
                  height: 3,
                }}
              >
                {w.lift && (
                  <span
                    style={{
                      width: 8,
                      height: 3,
                      background: brand,
                      opacity: w.done ? 1 : 0.4,
                    }}
                  />
                )}
                {w.run && (
                  <span
                    style={{
                      width: 8,
                      height: 3,
                      background: coral,
                      opacity: w.done ? 1 : 0.4,
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* HERO — Whoop-style readiness gauge + metric grid */}
        <div
          style={{
            ...panel,
            marginTop: 14,
            padding: 18,
            display: "flex",
            gap: 18,
            alignItems: "center",
          }}
        >
          <Ring
            pct={DATA.healthScore}
            size={104}
            stroke={6}
            track={t.line}
            color={brand}
            glow={dark ? `${brand}55` : undefined}
          >
            <div
              style={{
                fontFamily: mono,
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: -1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {DATA.healthScore}
              <span style={{ fontSize: 14, opacity: 0.5 }}>%</span>
            </div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div style={eyebrow}>Readiness</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: -0.3,
              }}
            >
              Primed · push load OK
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginTop: 12,
              }}
            >
              <Metric
                label="PERF IDX"
                value={`${DATA.performance}`}
                delta="+6"
                up
                mono={mono}
                eyebrow={eyebrow}
                green={green}
                text={t.text}
              />
              <Metric
                label="STEPS"
                value={fmt(DATA.steps)}
                delta="62%"
                up
                mono={mono}
                eyebrow={eyebrow}
                green={green}
                text={t.text}
              />
            </div>
          </div>
        </div>

        {/* Dense metric grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 10,
          }}
        >
          <TechTile
            label="KCAL"
            value={fmt(DATA.calories.eaten)}
            foot={`/ ${fmt(DATA.calories.target)}`}
            pct={(DATA.calories.eaten / DATA.calories.target) * 100}
            c="#D9884E"
            panel={panel}
            eyebrow={eyebrow}
            mono={mono}
            line={t.line}
            sub={t.sub}
          />
          <TechTile
            label="H2O"
            value={`${(DATA.water.ml / 1000).toFixed(1)}L`}
            foot={`/ ${(DATA.water.target / 1000).toFixed(1)}`}
            pct={(DATA.water.ml / DATA.water.target) * 100}
            c="#52A3BD"
            panel={panel}
            eyebrow={eyebrow}
            mono={mono}
            line={t.line}
            sub={t.sub}
          />
          <TechTile
            label="MASS"
            value={`${DATA.weight.kg}`}
            foot={`${DATA.weight.deltaKg}kg`}
            pct={68}
            c={green}
            panel={panel}
            eyebrow={eyebrow}
            mono={mono}
            line={t.line}
            sub={t.sub}
          />
        </div>

        {/* Today — terminal-style command row */}
        <div style={{ ...panel, marginTop: 10, padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={eyebrow}>Today · 02 sessions queued</div>
            <span style={{ ...eyebrow, color: brand }}>LIFT + RUN</span>
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <CmdRow
              accent={brand}
              title={DATA.today.title}
              meta={DATA.today.meta}
              mono={mono}
              line={t.line}
              text={t.text}
              sub={t.sub}
            />
            <CmdRow
              accent={coral}
              title="Easy 5K"
              meta={DATA.today.run}
              mono={mono}
              line={t.line}
              text={t.text}
              sub={t.sub}
            />
          </div>
          <button
            style={{
              marginTop: 14,
              width: "100%",
              minHeight: 46,
              borderRadius: 10,
              border: `1px solid ${brand}`,
              background: `${brand}1f`,
              color: dark ? "#fff" : brand,
              fontFamily: mono,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            ▶ EXECUTE PUSH DAY
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────
function Hex({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg,#9590E0,#7B72E9)",
        clipPath: "polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: size * 0.5,
      }}
    >
      ▲
    </div>
  );
}
function Dot({ c, done }: { c: string; done?: boolean }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 999,
        background: c,
        opacity: done ? 1 : 0.4,
      }}
    />
  );
}
function Bar({ pct, c, track }: { pct: number; c: string; track: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: track,
        marginTop: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, pct)}%`,
          background: c,
          borderRadius: 999,
          transition: "width 1s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </div>
  );
}
function Mini({
  label,
  value,
  sub,
  color,
  text,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  text: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color, letterSpacing: 0.6 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          marginTop: 3,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 11, color }}>{sub}</span>
      </div>
    </div>
  );
}
function BoldStat({
  label,
  value,
  accent,
  foot,
  t,
}: {
  label: string;
  value: string;
  accent: string;
  foot: string;
  t: { card: string; hair: string; sub: string; text: string };
}) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.hair}`,
        borderRadius: 22,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: accent,
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 46,
          fontWeight: 800,
          letterSpacing: -2.4,
          marginTop: 4,
          lineHeight: 1,
          color: t.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{ fontSize: 12, color: t.sub, marginTop: 6, fontWeight: 600 }}
      >
        {foot}
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  delta,
  up,
  mono,
  eyebrow,
  green,
  text,
}: {
  label: string;
  value: string;
  delta: string;
  up?: boolean;
  mono: string;
  eyebrow: React.CSSProperties;
  green: string;
  text: string;
}) {
  return (
    <div>
      <div style={eyebrow}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginTop: 3,
        }}
      >
        <span
          style={{
            fontFamily: mono,
            fontSize: 19,
            fontWeight: 600,
            color: text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontFamily: mono,
            fontSize: 11,
            color: up ? green : "#D4637A",
          }}
        >
          {up ? "▲" : "▼"}
          {delta}
        </span>
      </div>
    </div>
  );
}
function TechTile({
  label,
  value,
  foot,
  pct,
  c,
  panel,
  eyebrow,
  mono,
  line,
  sub,
}: {
  label: string;
  value: string;
  foot: string;
  pct: number;
  c: string;
  panel: React.CSSProperties;
  eyebrow: React.CSSProperties;
  mono: string;
  line: string;
  sub: string;
}) {
  return (
    <div style={{ ...panel, padding: 12 }}>
      <div style={eyebrow}>{label}</div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 18,
          fontWeight: 600,
          marginTop: 5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: mono, fontSize: 10, color: sub, marginTop: 1 }}>
        {foot}
      </div>
      <Bar pct={pct} c={c} track={line} />
    </div>
  );
}
function CmdRow({
  accent,
  title,
  meta,
  mono,
  line,
  text,
  sub,
}: {
  accent: string;
  title: string;
  meta: string;
  mono: string;
  line: string;
  text: string;
  sub: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        border: `1px solid ${line}`,
        borderRadius: 8,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: text,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </div>
        <div
          style={{ fontFamily: mono, fontSize: 11, color: sub, marginTop: 1 }}
        >
          {meta}
        </div>
      </div>
      <span style={{ fontFamily: mono, fontSize: 11, color: sub }}>›</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Shell — phone frame + floating variant / theme switcher.
// ═════════════════════════════════════════════════════════════════════════
const VARIANTS = [
  { id: "1", name: "Calm-luxe", hint: "Oura / Things" },
  { id: "2", name: "Bold", hint: "NRC / Strava" },
  { id: "3", name: "Tech", hint: "Linear / Whoop" },
] as const;

export default function HomePrototype() {
  const [params, setParams] = useSearchParams();
  const v = params.get("v") ?? "1";
  const mode = (params.get("mode") as Mode) ?? "light";

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, val]) => p.set(k, val));
    setParams(p, { replace: true });
  };

  const screen =
    v === "2" ? (
      <BoldExpressive mode={mode} />
    ) : v === "3" ? (
      <TechPrecise mode={mode} />
    ) : (
      <CalmLuxe mode={mode} />
    );

  const barBg =
    mode === "dark" ? "rgba(20,20,26,0.82)" : "rgba(255,255,255,0.82)";
  const barText = mode === "dark" ? "#fff" : "#1C1B22";
  const barBorder =
    mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: mode === "dark" ? "#000" : "#E9E8EE",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* Phone column */}
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100dvh",
          position: "relative",
          fontFamily: "'Plus Jakarta Sans',system-ui,-apple-system,sans-serif",
          WebkitFontSmoothing: "antialiased",
          overflow: "hidden",
        }}
      >
        {screen}
      </div>

      {/* Floating switcher */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "flex",
          gap: 6,
          padding: 6,
          borderRadius: 999,
          background: barBg,
          border: `1px solid ${barBorder}`,
          backdropFilter: "blur(16px)",
          boxShadow: "0 18px 40px -16px rgba(0,0,0,0.5)",
        }}
      >
        {VARIANTS.map((opt) => {
          const active = v === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => set({ v: opt.id })}
              title={opt.hint}
              style={{
                minHeight: 44,
                padding: "0 14px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: active ? "#7B72E9" : "transparent",
                color: active ? "#fff" : barText,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1.1,
              }}
            >
              <span>{opt.name}</span>
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>
                {opt.hint}
              </span>
            </button>
          );
        })}
        <span style={{ width: 1, background: barBorder, margin: "4px 2px" }} />
        <button
          onClick={() => set({ mode: mode === "dark" ? "light" : "dark" })}
          title="Toggle light / dark"
          style={{
            minHeight: 44,
            minWidth: 44,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            color: barText,
            fontSize: 18,
          }}
        >
          {mode === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}
