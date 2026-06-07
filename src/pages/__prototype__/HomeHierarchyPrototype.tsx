import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  TrendingUp,
  Dumbbell,
  Footprints,
  Plus,
  Droplet,
  Scale,
  Sparkles,
} from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { PrototypeSwitcher } from "@/components/__prototype__/PrototypeSwitcher";

/**
 * __PROTOTYPE__ — Home visual-hierarchy / section-grouping exploration
 * (Home2-hierarchy). Three structurally-different arrangements of the
 * Home card stack, switchable via `?variant=A|B|C` + the floating bar.
 *
 *   A — Flat (control): today's equal-altitude space-y stack, no labels.
 *   B — Grouped (iOS): SectionLabel headers (YOUR WEEK / PERFORMANCE /
 *       TODAY), tight within a group, airy between groups.
 *   C — Hero-first: one dominant Performance hero, everything else
 *       demoted into a compact secondary tier.
 *
 * Cards are FAITHFUL MOCKS (real card classes, the SectionLabel
 * primitive, real sport tokens, representative content + density) — not
 * wired to data. The question is ARRANGEMENT, not card internals.
 *
 * Mounted dev-only + outside the auth gate so it's viewable without a
 * login. THROWAWAY: fold the winning arrangement into src/pages/Home.tsx
 * and delete this file + PrototypeSwitcher + the App.tsx route.
 */

/* ── Faithful mock cards ─────────────────────────────────────────── */

function WeekStripMock() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  // dot lane per day: run (coral) / lift (purple) / both / rest
  const lanes: ("run" | "lift" | "both" | "rest")[] = [
    "rest",
    "lift",
    "run",
    "lift",
    "both",
    "rest",
    "run",
  ];
  return (
    <div className="bg-card rounded-2xl card-shadow p-3">
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const today = i === 4;
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 ${today ? "bg-primary/10" : ""}`}
            >
              <span className="text-micro font-semibold text-muted-foreground">
                {d}
              </span>
              <span className="text-sm font-mono tabular-nums font-bold text-foreground">
                {i + 3}
              </span>
              <span className="flex gap-0.5 h-1.5">
                {(lanes[i] === "run" || lanes[i] === "both") && (
                  <span className="size-1.5 rounded-full bg-running" />
                )}
                {(lanes[i] === "lift" || lanes[i] === "both") && (
                  <span className="size-1.5 rounded-full bg-lifting" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PerformanceHeroMock({ big = false }: { big?: boolean }) {
  return (
    <div className={`bg-card rounded-2xl card-shadow ${big ? "p-5" : "p-4"}`}>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="size-4 text-primary" aria-hidden />
        <SectionLabel>Performance</SectionLabel>
      </div>
      <div className="flex items-center gap-6">
        <div
          className={`relative ${big ? "size-28" : "size-24"} flex-shrink-0 grid place-items-center`}
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
              strokeDasharray={`${2 * Math.PI * 40 * 0.75 * 0.82} ${2 * Math.PI * 40}`}
              strokeLinecap="round"
            />
          </svg>
          <span
            className={`absolute ${big ? "text-5xl" : "text-display"} font-extrabold font-mono tabular-nums text-primary`}
          >
            82
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary/80">Building</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strong week — your load is trending up nicely.
          </p>
          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium bg-success/10 text-success">
            <TrendingUp className="size-3" /> +6 from last week
          </span>
        </div>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  pct,
  cls,
}: {
  label: string;
  pct: number;
  cls: string;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-micro font-semibold text-muted-foreground">
          {label}
        </span>
        <span className="text-micro font-mono tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full ${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TodayEnergyMock({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`bg-card rounded-2xl card-shadow ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Today's energy</SectionLabel>
        <span className="text-micro text-muted-foreground font-mono tabular-nums">
          1,840 / 2,300 kcal
        </span>
      </div>
      <div className="flex items-end gap-1 mb-3">
        <span className="text-3xl font-extrabold font-mono tabular-nums text-foreground leading-none">
          460
        </span>
        <span className="text-xs text-muted-foreground mb-0.5">kcal left</span>
      </div>
      <div className="flex gap-3">
        <MacroBar label="P" pct={72} cls="bg-success" />
        <MacroBar label="C" pct={58} cls="bg-[color:var(--ds-orange-500)]" />
        <MacroBar label="F" pct={64} cls="bg-warning" />
      </div>
    </div>
  );
}

function ActionPill({
  icon: Icon,
  label,
  tint,
}: {
  icon: typeof Plus;
  label: string;
  tint: string;
}) {
  return (
    <button
      type="button"
      className={`flex-1 min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 ${tint}`}
    >
      <Icon className="size-4" />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}

function StackedCTAMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Action pills */}
      <div className="flex gap-2">
        <ActionPill
          icon={Plus}
          label="Quick Log"
          tint="bg-primary/[0.06] text-primary"
        />
        <ActionPill
          icon={Footprints}
          label="Start Run"
          tint="bg-running/[0.06] text-running"
        />
        <ActionPill
          icon={Plus}
          label="Log Food"
          tint="bg-[color:var(--ds-orange-500)]/[0.06] text-[color:var(--ds-orange-600)]"
        />
      </div>
      {/* Today's session CTA */}
      <div className="rounded-xl bg-lifting/[0.08] p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-4 text-lifting" />
          <div>
            <p className="text-sm font-semibold text-foreground">Upper Body</p>
            <p className="text-micro text-muted-foreground">
              Today · 6 exercises
            </p>
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-lifting text-white text-xs font-semibold">
          Start
        </span>
      </div>
      {/* Hero tiles: water + health */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-card card-shadow p-4">
          <div className="flex items-center gap-2 mb-2">
            <Droplet className="size-4 text-[color:var(--hydration,#52A3BD)]" />
            <SectionLabel>Water</SectionLabel>
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-foreground">
            5 / 8
          </p>
        </div>
        <div className="rounded-2xl bg-card card-shadow p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-success" />
            <SectionLabel>Health</SectionLabel>
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-foreground">
            78
          </p>
        </div>
      </div>
      {/* Weight + steps */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted p-3">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="size-3.5 text-muted-foreground" />
            <SectionLabel>Weight</SectionLabel>
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            74.2 <span className="text-xs text-muted-foreground">kg</span>
          </p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="flex items-center gap-2 mb-1">
            <Footprints className="size-3.5 text-muted-foreground" />
            <SectionLabel>Steps</SectionLabel>
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            6,420
          </p>
        </div>
      </div>
    </div>
  );
}

function InsightMock() {
  return (
    <div className="rounded-xl bg-primary/[0.06] p-3 flex items-start gap-2">
      <Sparkles className="size-4 text-primary mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-semibold text-foreground">
          Recovery looks good
        </p>
        <p className="text-micro text-muted-foreground">
          Two rest days this week — your readiness is back up.
        </p>
      </div>
    </div>
  );
}

function NudgeMock() {
  return (
    <div className="rounded-xl border border-primary/20 bg-card p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-xs text-foreground">
          Set a goal weight to dial in your calories.
        </p>
      </div>
      <span className="text-xs font-semibold text-primary">Set →</span>
    </div>
  );
}

/* ── Arrangers ───────────────────────────────────────────────────── */

/** A — Flat control: equal-altitude space-y stack, no group labels. */
function VariantA() {
  return (
    <div className="flex flex-col gap-4">
      <WeekStripMock />
      <PerformanceHeroMock />
      <NudgeMock />
      <TodayEnergyMock />
      <StackedCTAMock />
      <InsightMock />
    </div>
  );
}
VariantA.variantName = "Flat (control)";

/** B — Grouped iOS sections: labelled groups, tight within, airy between. */
function VariantB() {
  return (
    <div className="flex flex-col gap-7">
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
        <PerformanceHeroMock />
        <InsightMock />
      </section>

      <section className="space-y-2">
        <SectionLabel tier="section" className="px-1">
          Today
        </SectionLabel>
        <NudgeMock />
        <TodayEnergyMock />
        <StackedCTAMock />
      </section>
    </div>
  );
}
VariantB.variantName = "Grouped (iOS sections)";

/** C — Hero-first: one dominant hero, everything else a compact tier. */
function VariantC() {
  return (
    <div className="flex flex-col gap-4">
      <PerformanceHeroMock big />
      <div className="h-px bg-border/60" />
      {/* Demoted secondary tier — tighter, quieter */}
      <div className="space-y-2 opacity-95">
        <WeekStripMock />
        <TodayEnergyMock compact />
        <StackedCTAMock compact />
        <InsightMock />
      </div>
    </div>
  );
}
VariantC.variantName = "Hero-first (demoted tail)";

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
        {/* Mock header so density matches the real page */}
        <div className="flex items-center justify-between pt-1 pb-3">
          <h1 className="text-xl font-extrabold tracking-wider text-foreground uppercase">
            TROPOS
          </h1>
          <span className="text-xs font-medium text-muted-foreground">
            Week 3
          </span>
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
