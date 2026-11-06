import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { plannedRunMinutes } from "./runTimeLimits";
import {
  previewRunningAdaptation,
  type AdaptationReview,
  type AdaptationSession,
  type AdaptationPreview,
} from "./runningAdaptationPreview";

export interface AdaptationPlanEntry {
  id: string;
  date: string;
  templateId: string;
  /** The caller must classify manual/completed/moved entries from canonical state. */
  protected: boolean;
}
export interface AdaptationSelection {
  sessionId: string;
  maxMinutes: number;
  /** Run/walk structure is selected explicitly, never inferred from total minutes. */
  format: { kind: "easy" } | { kind: "run_walk"; templateId: string };
}

type PlanBlocker = "protected_history" | "invalid_selection" | "unsupported_template" | "no_matching_template";
export type RunningAdaptationPlan =
  | { status: "blocked"; reason: PlanBlocker; alternative: "pause_or_review" }
  | { status: "evaluated"; preview: AdaptationPreview; proposed: (AdaptationSession & { templateId: string })[] };

function summary(template: RunTemplate, entry: AdaptationPlanEntry, minutes: number): AdaptationSession {
  return { id: entry.id, date: entry.date, minutes, kind: template.config.runWalk ? "run_walk" :
    template.type === "easy" && !template.config.strides ? "easy" : template.type === "long" ? "long" : "quality" };
}

/** Disabled candidate. Shapes exactly one bounded future week from explicit
 * user-selected session identities. It does not pick training days or run/walk
 * progression, alter history, fill missing weeks or fit training to a race date.
 */
export function planRunningAdaptation(input: {
  review: Omit<AdaptationReview, "current" | "proposed">;
  windowStart: string;
  current: readonly AdaptationPlanEntry[];
  selections: readonly AdaptationSelection[];
  confirmedEasyPaceSecondsPerKm?: number;
}): RunningAdaptationPlan {
  const block = (reason: PlanBlocker): RunningAdaptationPlan => ({ status: "blocked", reason, alternative: "pause_or_review" });
  const start = Date.parse(`${input.windowStart}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.windowStart) || !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, 10) !== input.windowStart ||
    input.current.some((s) => { const date = Date.parse(`${s.date}T00:00:00Z`); return !Number.isFinite(date) || date < start || date >= start + 7 * 86400000; })) return block("invalid_selection");
  if (input.current.some((s) => s.protected)) return block("protected_history");
  if (!input.selections.length || new Set(input.selections.map((s) => s.sessionId)).size !== input.selections.length ||
    input.selections.some((s) => !Number.isFinite(s.maxMinutes) || s.maxMinutes <= 0 || !input.current.some((c) => c.id === s.sessionId))) return block("invalid_selection");
  const current: AdaptationSession[] = [];
  for (const entry of input.current) {
    const template = RUN_TEMPLATES.find((t) => t.id === entry.templateId);
    if (!template || template.type === "race") return block("unsupported_template");
    // Distance targets cannot be bounded by the catalogue's estimated duration.
    if (template.config.targetDistanceKm && !(Number.isFinite(input.confirmedEasyPaceSecondsPerKm) && input.confirmedEasyPaceSecondsPerKm! > 0)) return block("unsupported_template");
    current.push(summary(template, entry, plannedRunMinutes(template, input.confirmedEasyPaceSecondsPerKm)));
  }
  const proposed: (AdaptationSession & { templateId: string })[] = [];
  for (const selection of input.selections) {
    const entry = input.current.find((s) => s.id === selection.sessionId)!;
    const original = current.find((s) => s.id === selection.sessionId)!;
    const restrictions = input.review.restrictions;
    const cap = Math.min(selection.maxMinutes, original.minutes, input.review.capacity.longestMinutes,
      restrictions.status === "specified" ? restrictions.maxMinutes ?? Infinity : Infinity);
    const candidates = RUN_TEMPLATES.filter((t) => {
      if (t.type !== "easy" || t.config.strides || t.config.targetDistanceKm || t.config.intervals || t.config.tempo || t.estimatedDuration > cap) return false;
      if (selection.format.kind === "run_walk") return (original.kind !== "run_walk" || t.id === entry.templateId) && t.id === selection.format.templateId && !!t.config.runWalk;
      // Do not silently replace a run/walk plan with continuous running.
      return original.kind !== "run_walk" && !t.config.runWalk;
    }).sort((a, b) => b.estimatedDuration - a.estimatedDuration || a.id.localeCompare(b.id));
    const chosen = candidates[0];
    if (!chosen) return block("no_matching_template");
    proposed.push({ ...summary(chosen, entry, chosen.estimatedDuration), templateId: chosen.id });
  }
  const preview = previewRunningAdaptation({ ...input.review, current, proposed });
  return { status: "evaluated", preview, proposed: preview.status === "preview" ? proposed : [] };
}
