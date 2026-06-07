import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Footprints,
  Droplet,
  Scale,
  Sparkles,
  Flame,
  Settings as SettingsIcon,
  Play,
  ChevronDown,
  ChevronRight,
  UtensilsCrossed,
  Minus,
  Plus,
} from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { PrototypeSwitcher } from "@/components/__prototype__/PrototypeSwitcher";

/**
 * __PROTOTYPE__ — Home visual-hierarchy / section-grouping exploration
 * (Home2-hierarchy). Mocks now mirror the ACTUAL current Home screen
 * (from real device screenshots) so the comparison is faithful:
 *
 *   A — Current (control): the real flat stack exactly as shipped today.
 *   B — Grouped: same cards, clustered under SectionLabel headers
 *       (YOUR WEEK / PERFORMANCE / TODAY).
 *   C — Recommended: compact alerts zone + grouping, and Performance
 *       (passive weekly score) demoted BELOW the stuff you act on daily.
 *
 * Cards are FAITHFUL MOCKS (real card classes, SectionLabel, sport
 * tokens, real current copy/numbers) — not wired to data. The real
 * fold-in wraps the LIVE Home cards unchanged; only arrangement changes.
 *
 * Dev-only + outside the auth gate → viewable without login at
 * /prototype/home-hierarchy. THROWAWAY.
 */

/* ── Faithful mock cards (mirror the real current Home) ───────────── */

function ProStripMock() {
  return (
    <div className="rounded-2xl bg-primary/[0.08] p-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Sparkles className="size-5 text-primary" />
        <span className="text-base font-semibold text-foreground">
          Upgrade to Pro
        </span>
      </div>
      <span className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold">
        See plans
      </span>
    </div>
  );
}

function StreakRiskMock({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl bg-[color:var(--ds-orange-500)]/[0.10] flex items-center gap-3 ${compact ? "p-2.5" : "p-4"}`}
    >
      <Flame className="size-6 text-[color:var(--ds-orange-600)] shrink-0" />
      <div>
        <p className="text-base font-bold text-[color:var(--ds-orange-600)] leading-tight">
          3-day streak at risk
        </p>
        {!compact && (
          <p className="text-sm text-muted-foreground">
            Log a workout, run or meal to keep it alive.
          </p>
        )}
      </div>
    </div>
  );
}

function WeekStripMock() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const nums = [7, 8, 9, 10, 11, 12, 13];
  // dots per the real screenshot: run=coral, lift=purple
  const lanes: ("run" | "lift" | "both")[] = [
    "run",
    "both",
    "both",
    "both",
    "both",
    "both",
    "lift",
  ];
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const today = i === 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1.5 py-1">
            <span className="text-sm text-muted-foreground">{d}</span>
            <span
              className={`size-9 grid place-items-center rounded-full text-base font-mono tabular-nums font-bold ${today ? "bg-primary text-white ring-4 ring-primary/20" : "text-foreground"}`}
            >
              {nums[i]}
            </span>
            <span className="flex gap-1 h-2">
              {(lanes[i] === "lift" || lanes[i] === "both") && (
                <span className="size-2 rounded-full bg-lifting" />
              )}
              {(lanes[i] === "run" || lanes[i] === "both") && (
                <span className="size-2 rotate-45 bg-running" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PerformanceMock({ compact = false }: { compact?: boolean }) {
  const ring = (
    <div
      className={`relative ${compact ? "size-16" : "size-28"} flex-shrink-0 grid place-items-center`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-[135deg]">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="hsl(var(--primary) / 0.15)"
          strokeWidth="7"
          strokeDasharray={`${2 * Math.PI * 40 * 0.75} ${2 * Math.PI * 40}`}
          strokeLinecap="round"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="7"
          strokeDasharray={`${2 * Math.PI * 40 * 0.75 * 0.45} ${2 * Math.PI * 40}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`absolute ${compact ? "text-xl" : "text-5xl"} font-extrabold font-mono tabular-nums text-primary`}
      >
        45
      </span>
    </div>
  );

  return (
    <div
      className={`bg-card rounded-2xl card-shadow ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity className="size-4 text-primary" aria-hidden />
        <SectionLabel>Performance</SectionLabel>
      </div>
      <div className={`flex items-center ${compact ? "gap-3" : "gap-6"}`}>
        {ring}
        <div className="flex-1 min-w-0">
          <p
            className={`${compact ? "text-base" : "text-xl"} font-semibold text-primary`}
          >
            Cruising
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fewer sessions than usual
          </p>
        </div>
      </div>
    </div>
  );
}

function MacroRing({ label, target }: { label: string; target: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="size-16 rounded-full border-2 border-muted grid place-items-center">
        <span className="text-sm font-mono tabular-nums text-muted-foreground">
          0g
        </span>
      </div>
      <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-micro font-mono tabular-nums text-muted-foreground/70">
        {target}
      </span>
    </div>
  );
}

function TodayEnergyMock() {
  return (
    <div className="bg-card rounded-2xl card-shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-foreground">
            Today's Energy
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[color:var(--ds-orange-500)]/[0.12] text-[color:var(--ds-orange-600)] text-micro font-semibold">
            Bulk · +300
          </span>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </div>
      <div className="flex items-end gap-1.5 mb-2">
        <span className="text-2xl font-extrabold font-mono tabular-nums text-foreground leading-none">
          0
        </span>
        <span className="text-sm text-muted-foreground">/ 2,933 kcal</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted mb-4" />
      <div className="flex justify-around">
        <MacroRing label="Protein" target="150g" />
        <MacroRing label="Carbs" target="451g" />
        <MacroRing label="Fat" target="59g" />
      </div>
      <div className="border-t border-border/50 mt-3 pt-2.5 flex justify-center">
        <span className="inline-flex items-center gap-1.5 text-[color:var(--ds-orange-600)] font-semibold">
          <UtensilsCrossed className="size-4" /> Log food
        </span>
      </div>
    </div>
  );
}

function RunCTAMock() {
  return (
    <div className="rounded-2xl bg-running/[0.10] p-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="size-11 rounded-2xl bg-running/15 grid place-items-center shrink-0">
          <Footprints className="size-5 text-running" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-running uppercase tracking-wide">
            Today · Run day
          </p>
          <p className="text-base font-bold text-foreground leading-tight">
            Long 15K <span className="text-running">15km</span>
          </p>
          <p className="text-xs text-muted-foreground">15km steady state</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full bg-running text-white text-sm font-semibold shrink-0">
        <Play className="size-4 fill-white" /> Go
      </span>
    </div>
  );
}

function WaterMock() {
  return (
    <div className="relative rounded-2xl bg-card card-shadow overflow-hidden">
      {/* faux wave fill */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[color:#52A3BD]/30 to-[color:#52A3BD]/10" />
      <div className="relative p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[color:#52A3BD]/15 grid place-items-center">
            <Droplet className="size-5 text-[color:#52A3BD]" />
          </div>
          <div>
            <SectionLabel>Water</SectionLabel>
            <p className="text-xl font-extrabold font-mono tabular-nums text-foreground">
              5 <span className="text-sm text-muted-foreground">/ 8</span>
            </p>
            <p className="text-micro text-muted-foreground font-mono tabular-nums">
              1.25 L
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-10 rounded-full bg-[color:#52A3BD]/15 grid place-items-center text-[color:#52A3BD]">
            <Minus className="size-4" />
          </span>
          <span className="size-10 rounded-full bg-[color:#52A3BD]/15 grid place-items-center text-[color:#52A3BD]">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

function WeightStepsMock() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-muted p-3 relative">
        <div className="flex items-center gap-2 mb-1">
          <span className="size-7 rounded-lg bg-primary/10 grid place-items-center">
            <Scale className="size-3.5 text-primary" />
          </span>
          <SectionLabel>Weight</SectionLabel>
        </div>
        <p className="text-xl font-bold font-mono tabular-nums text-foreground">
          92.0 <span className="text-xs text-muted-foreground">kg</span>
        </p>
        <p className="text-micro text-muted-foreground">Logged 3d ago</p>
        <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
      </div>
      <div className="rounded-xl bg-muted p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="size-7 rounded-lg bg-success/10 grid place-items-center">
            <Footprints className="size-3.5 text-success" />
          </span>
          <SectionLabel>Steps</SectionLabel>
        </div>
        <span className="inline-flex items-center gap-1 text-primary text-sm font-medium">
          Connect Health →
        </span>
      </div>
    </div>
  );
}

/* ── Arrangers ───────────────────────────────────────────────────── */

/** A — Current control: the real flat stack, exactly as shipped today. */
function VariantA() {
  return (
    <div className="flex flex-col gap-4">
      <ProStripMock />
      <StreakRiskMock />
      <WeekStripMock />
      <PerformanceMock />
      <TodayEnergyMock />
      <RunCTAMock />
      <WaterMock />
      <WeightStepsMock />
    </div>
  );
}
VariantA.variantName = "Current (control)";

/** B — Grouped: same cards under SectionLabel headers. */
function VariantB() {
  return (
    <div className="flex flex-col gap-6">
      {/* Banners stay at the top, ungrouped */}
      <div className="space-y-2">
        <ProStripMock />
        <StreakRiskMock />
      </div>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Your week
        </SectionLabel>
        <WeekStripMock />
      </section>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Performance
        </SectionLabel>
        <PerformanceMock />
      </section>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Today
        </SectionLabel>
        <TodayEnergyMock />
        <RunCTAMock />
        <WaterMock />
        <WeightStepsMock />
      </section>
    </div>
  );
}
VariantB.variantName = "Grouped (iOS sections)";

/**
 * C — Chosen: compact alerts zone (streak chip + Pro shrunk so they don't
 * outrank data) + grouped sections, with Performance kept in its current
 * slot at full size (between the week and today).
 */
function VariantC() {
  return (
    <div className="flex flex-col gap-6">
      {/* Compact alerts zone */}
      <div className="space-y-1.5">
        <StreakRiskMock compact />
        <ProStripMock />
      </div>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          This week
        </SectionLabel>
        <WeekStripMock />
      </section>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Performance
        </SectionLabel>
        <PerformanceMock />
      </section>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Today
        </SectionLabel>
        <TodayEnergyMock />
        <RunCTAMock />
        <WaterMock />
        <WeightStepsMock />
      </section>
    </div>
  );
}
VariantC.variantName = "Chosen (alerts zone + grouped, Performance in place)";

const VARIANTS: Record<string, { Comp: () => ReactElement; name: string }> = {
  A: { Comp: VariantA, name: VariantA.variantName },
  B: { Comp: VariantB, name: VariantB.variantName },
  C: { Comp: VariantC, name: VariantC.variantName },
};

export default function HomeHierarchyPrototype() {
  const [params] = useSearchParams();
  const key = (params.get("variant") ?? "A").toUpperCase();
  const { Comp } = VARIANTS[key] ?? VARIANTS.A;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-md px-4 pt-3 pb-24">
        {/* Faithful header — TROPOS + phase + streak pill + gear */}
        <div className="flex items-center justify-between pt-1 pb-3">
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold tracking-wider text-foreground uppercase leading-tight">
              TROPOS
            </h1>
            <span className="text-xs font-medium text-muted-foreground mt-0.5">
              Week 3 · progression phase
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-card card-shadow text-sm font-bold">
              <Flame className="size-4 text-[color:var(--ds-orange-500)]" /> 3
            </span>
            <span className="size-10 rounded-full bg-card card-shadow grid place-items-center">
              <SettingsIcon className="size-4 text-muted-foreground" />
            </span>
          </div>
        </div>
        <Comp />
      </div>
      <PrototypeSwitcher
        variants={["A", "B", "C"]}
        labels={Object.fromEntries(
          Object.entries(VARIANTS).map(([k, v]) => [k, v.name])
        )}
      />
    </div>
  );
}
