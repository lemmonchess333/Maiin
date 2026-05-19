/**
 * PerformanceCard — consolidated Performance hero (PI1 + PI1b).
 *
 * Replaces:
 *   - HealthScoreCard (Home daily 0-100 composite) — deleted
 *   - Compact-tile PerformanceCard (weekly 0-100 composite) — superseded
 *
 * Renders a single PI-driven hero with the visual chrome that was
 * HealthScoreCard's (rounded-2xl bg-card, 0.75-circumference ring,
 * gradient stroke, conditional glow, mono tabular CountUp number,
 * delta chip) but driven by the rolling-7-day PI now emitted by the
 * Cloud Function (PI1a). Activity icon (lucide-react) replaces the
 * Heart per PI1's icon-swap lock.
 *
 * Four states (PI1 lock):
 *   (1) loading      — muted placeholder; framer-motion fade-in on
 *                      first non-loading render. No skeleton: piggybacks
 *                      on HomeSkeleton for the initial Home load.
 *   (2) empty        — no perf doc yet. Chrome + muted ring + em-dash
 *                      number + onboarding copy. NO verb, NO delta.
 *   (3) low-confidence — full ring + PI + verb, but supporting line
 *                      uses sparse-data variants (handled by getLine).
 *                      Delta chip HIDDEN — single-doc baselines aren't
 *                      directional.
 *   (4) steady       — ring + PI + verb + data-aware line + delta chip.
 *
 * Accessibility (PI1 amendment 5):
 *   - aria-label: "Performance ${pi}, ${verb}" or "no data yet"
 *   - aria-describedby points to a SIBLING sr-only span carrying the
 *     line + delta + low-confidence note (NOT aria-hidden on sibling
 *     — round-12 grill caught aria-hidden defeating describedby).
 *   - motion.circle + useCountUp consult useReducedMotion via their
 *     own internal handling (motion-safe / hook respect).
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useCountUp } from "@/hooks/useCountUp";
import { getCardColour } from "@/lib/performanceColour";
import { getVerb, getLine, EMPTY_STATE_LINE } from "@/lib/performanceLine";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

interface PerformanceCardProps {
  /** Most recent rolling-7-day PI doc. `null` until the first doc lands. */
  currentWeek: PerformanceWeekDoc | null;
  /** Prior compute's doc, used for the delta chip. `null` when first doc. */
  previousWeek: PerformanceWeekDoc | null;
  /** True while usePerformanceWeeks is on its first onSnapshot tick. */
  loading: boolean;
  /** Sibling-id seed for aria-describedby; defaults to current weekKey. */
  uid?: string | null;
}

export default function PerformanceCard({
  currentWeek,
  previousWeek,
  loading,
}: PerformanceCardProps) {
  const navigate = useNavigate();

  // CountUp must be called unconditionally (hook order). Falls back
  // to 0 in empty/loading states; the rendered number is gated below.
  const pi = currentWeek ? Math.round(currentWeek.performanceIndex ?? 0) : 0;
  const piDisplay = useCountUp(pi, { sessionKey: "perf-hero", duration: 1 });

  function handleTap() {
    haptic();
    // Deep-link to /history#performance — same target the legacy
    // PerformanceCard used. PI5's locked spec flags this as interim;
    // reconciliation revisited in a future PerformanceTab grill.
    navigate("/history#performance");
  }

  // ── State derivation ─────────────────────────

  const isLoading = loading && !currentWeek;
  const hasDoc = !!currentWeek;

  // Low-confidence: doc exists but engine flagged confidence < high.
  // Per PI1 spec: hide delta chip, use sparse-data line variants
  // (handled inside getLine via lifetimeWeeks/daysSinceLastTraining).
  const isLowConfidence = hasDoc && currentWeek.confidence !== "high";

  // ── Derived presentation ─────────────────────

  const loadBand = currentWeek?.labels?.loadBand ?? currentWeek?.loadBand ?? "moderate";
  const deloadRecommended = !!currentWeek?.flags?.deloadRecommended || !!currentWeek?.deloadRecommended;

  const { hue, glowIntensity } = hasDoc
    ? getCardColour(pi, loadBand as Parameters<typeof getCardColour>[1], deloadRecommended)
    : { hue: THEME.text.muted, glowIntensity: 0 };

  const verb = hasDoc
    ? getVerb(loadBand as Parameters<typeof getVerb>[0], deloadRecommended)
    : null;

  // Supporting line: getLine for hasDoc states (steady + low-confidence
  // both flow through it — low-confidence falls into "building" /
  // "recovering" variants via signals.lifetimeWeeks).
  const line = currentWeek?.signals
    ? getLine(verb!.state, currentWeek.signals)
    : EMPTY_STATE_LINE;

  // Delta chip — hidden in empty + low-confidence per PI1 spec.
  const delta =
    hasDoc && !isLowConfidence && previousWeek
      ? Math.round((currentWeek!.performanceIndex ?? 0) - (previousWeek.performanceIndex ?? 0))
      : null;

  // ── Ring geometry (preserved from HealthScoreCard chrome) ────

  const radius = 40;
  const stroke = 7;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const offset = hasDoc ? arcLength - (arcLength * Math.min(pi, 100)) / 100 : arcLength;
  const glowFilter =
    hasDoc && glowIntensity > 0
      ? `drop-shadow(0 0 ${Math.round(6 + glowIntensity * 10)}px ${hue}${Math.round(0x20 + glowIntensity * 0x30)
          .toString(16)
          .padStart(2, "0")})`
      : undefined;

  // ── A11y sibling content ─────────────────────

  const describedById = currentWeek?.weekKey
    ? `perf-detail-${currentWeek.weekKey}`
    : "perf-detail-empty";
  const ariaLabel = hasDoc
    ? `Performance ${pi}, ${verb!.label}`
    : isLoading
      ? "Performance, loading"
      : "Performance, no data yet";
  const srDescription = [
    line,
    delta !== null && delta !== 0 ? `Change ${delta > 0 ? "+" : ""}${delta} from last week.` : null,
    isLowConfidence ? "Low confidence — based on limited data so far." : null,
  ]
    .filter(Boolean)
    .join(" ");

  // ── Delta chip presentation (preserved from HealthScoreCard) ──

  const deltaChip = (() => {
    if (delta === null || delta === 0) return null;
    if (delta > 0) {
      return {
        sign: `+${delta}`,
        color: THEME.semantic.positive,
        bg: THEME.semantic.positive + "1A",
        Icon: ArrowUpRight,
      };
    }
    return {
      sign: `${delta}`,
      color: THEME.text.muted,
      bg: THEME.text.muted + "1A",
      Icon: ArrowDownRight,
    };
  })();

  // ── Render ───────────────────────────────────

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={ariaLabel}
      aria-describedby={describedById}
      className="block w-full text-left p-4 rounded-2xl bg-card motion-safe:active:scale-[0.98] motion-safe:transition-transform"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      {/* Sibling sr-only span carrying line + delta + low-confidence note.
          aria-describedby points here. NOT aria-hidden — that would
          defeat the describedby reference per the PI1 round-12 spec
          correction. */}
      <span id={describedById} className="sr-only">
        {srDescription}
      </span>

      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4" style={{ color: hue }} aria-hidden="true" />
        <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>
          Performance
        </p>
      </div>

      <div className="flex items-center gap-6">
        {/* Ring */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full -rotate-[135deg]"
            style={{ filter: glowFilter }}
          >
            <defs>
              <linearGradient
                id="perfRingFill"
                x1="0"
                y1="0"
                x2="0"
                y2="100"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={hue} stopOpacity={0.5} />
                <stop offset="100%" stopColor={hue} stopOpacity={1} />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={hue + "1A"}
              strokeWidth={stroke}
              strokeDasharray={arcLength + " " + circumference}
              strokeLinecap="round"
            />
            <motion.circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="url(#perfRingFill)"
              strokeWidth={stroke}
              strokeDasharray={arcLength + " " + circumference}
              strokeLinecap="round"
              initial={{ strokeDashoffset: arcLength }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="text-display font-extrabold leading-none font-mono tabular-nums"
              style={{ color: hue }}
            >
              {hasDoc ? <motion.span>{piDisplay}</motion.span> : "—"}
            </p>
          </div>
        </div>

        {/* Right column — verb + supporting line + delta */}
        <div className="flex-1 min-w-0">
          {hasDoc && verb ? (
            <>
              <motion.p
                className="text-sm font-semibold"
                style={{ color: hue, opacity: 0.85 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                transition={{ delay: 1.2, duration: 0.2 }}
              >
                {verb.label}
              </motion.p>
              <p
                className="text-xs leading-snug mt-0.5"
                style={{ color: THEME.text.muted }}
              >
                {line}
              </p>
              {deltaChip ? (
                <div className="mt-1">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium"
                    style={{ backgroundColor: deltaChip.bg, color: deltaChip.color }}
                  >
                    <deltaChip.Icon className="w-3 h-3" aria-hidden="true" />
                    {deltaChip.sign} from last week
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs leading-snug" style={{ color: THEME.text.muted }}>
              {isLoading
                ? " " /* nbsp — preserves card height while loading */
                : EMPTY_STATE_LINE}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
