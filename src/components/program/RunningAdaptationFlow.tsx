import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/Select";
import type { RunningNegotiationResponse } from "@/features/program/runningPrescriptionGate";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import RunningAdaptationPreview from "./RunningAdaptationPreview";
import RunningOutsideTraining from "./RunningOutsideTraining";
import { RUNNING_ADAPTATION_ENABLED, type AdaptationApplyReceipt } from "@/features/program/runningAdaptationApply";
import { RUNNING_PRESCRIPTION_GATE_ENABLED } from "@/features/program/runningPrescriptionFeature";
import { runningReviewTransport as transport } from "@/features/program/runningReviewTransport";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { AdaptationReview, AdaptationPreview } from "@/features/program/runningAdaptationPreview";

type Session = { id: string; date: string; templateId: string; minutes: number; kind: string };
type Authority = { migration?: { version: number; status: string; legacyStateExisted: boolean }; accountId: string; revision: number; timeZone: string; holds: string[]; plan: { raceGoalId: string | null; sessions: Session[] } };
type LegacyReview = NonNullable<RunningNegotiationResponse["legacyReconciliation"]>;
type Negotiated = { status: string; authority: Authority | null; legacyReview: LegacyReview | null };
type Proposal = { id: string; expiresAtMs: number; preview: Extract<AdaptationPreview, { status: "preview" }> };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function negotiated(raw: unknown, uid: string): Negotiated {
  if (!record(raw) || raw.accountId !== uid || !["ready", "held", "not_enrolled", "unavailable"].includes(raw.status as string)) throw Error("The running review response could not be verified.");
  if (raw.status === "not_enrolled" || raw.status === "unavailable") return { status: raw.status, authority: null, legacyReview: null };
  const a = raw.authority;
  if (!record(a) || a.accountId !== uid || typeof a.timeZone !== "string" || !a.timeZone || a.schemaVersion !== 1 || !Number.isSafeInteger(a.revision) || (a.revision as number) < 0 ||
    !Array.isArray(a.holds) || !a.holds.every((h) => typeof h === "string") || !record(a.plan) ||
    !(a.plan.raceGoalId === null || typeof a.plan.raceGoalId === "string") || !Array.isArray(a.plan.sessions) ||
    !a.plan.sessions.every((s) => record(s) && typeof s.id === "string" && typeof s.date === "string" && typeof s.templateId === "string" && Number.isFinite(s.minutes) && typeof s.kind === "string")) throw Error("The current running plan needs a fresh review.");
  let legacyReview: LegacyReview | null = null;
  if (raw.legacyReconciliation !== undefined) {
    const legacy = raw.legacyReconciliation;
    if (!record(legacy) || legacy.version !== 1 || typeof legacy.snapshotDigest !== "string" || !legacy.snapshotDigest ||
      !Array.isArray(legacy.evidence) || !legacy.evidence.every((e) => typeof e === "string") || !Array.isArray(legacy.holds) || !legacy.holds.every((h) => typeof h === "string")) throw Error("Previous training needs a fresh review.");
    legacyReview = legacy as LegacyReview;
  }
  return { status: raw.status as string, authority: a as unknown as Authority, legacyReview };
}
function proposalFrom(raw: unknown, a: Authority): Proposal {
  if (!record(raw) || !record(raw.proposal)) throw Error("The preview could not be verified.");
  const p = raw.proposal; const v = p.preview;
  if (typeof p.id !== "string" || !Number.isFinite(p.expiresAtMs) || (p.expiresAtMs as number) <= Date.now() ||
    p.accountId !== a.accountId || p.baseRevision !== a.revision || !record(v) || v.status !== "preview" ||
    v.accountId !== a.accountId || v.revision !== a.revision || v.raceGoalId !== a.plan.raceGoalId ||
    !record(v.days) || !record(v.longestMinutes) || ![v.days.before, v.days.after, v.longestMinutes.before, v.longestMinutes.after].every(Number.isFinite) ||
    !Array.isArray(v.removedIds) || !v.removedIds.every((id) => typeof id === "string") || !Array.isArray(v.changedIds) || !v.changedIds.every((id) => typeof id === "string") || !Array.isArray(v.before) || !Array.isArray(v.after) || ![...v.before, ...v.after].every((s) => record(s) && typeof s.id === "string" && typeof s.date === "string" && Number.isFinite(s.minutes) && ["easy", "quality", "long", "run_walk"].includes(s.kind as string))) throw Error("The preview no longer matches your plan.");
  return p as unknown as Proposal;
}

/** Real settings flow, mounted only by the two source-time release switches.
 * No local draft is authority, and no automatic enrollment/hold release occurs. */
export default function RunningAdaptationFlow({ expectedUid }: { expectedUid: string }) {
  if (!RUNNING_ADAPTATION_ENABLED || !RUNNING_PRESCRIPTION_GATE_ENABLED) return null;
  return <Flow key={expectedUid} expectedUid={expectedUid} />;
}
function Flow({ expectedUid }: { expectedUid: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Negotiated>({ status: "loading", authority: null, legacyReview: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [enrollmentConsent, setEnrollmentConsent] = useState(false);
  const [migrationConsent, setMigrationConsent] = useState("");
  const [initialDates, setInitialDates] = useState(["", "", ""]);
  const [initialConsent, setInitialConsent] = useState(false);
  const [symptoms, setSymptoms] = useState("");
  const [days, setDays] = useState(""); const [minutes, setMinutes] = useState("");
  const [capacityUnknown, setCapacityUnknown] = useState(false);
  const [capacityConfirmed, setCapacityConfirmed] = useState(false); const [afterEffects, setAfterEffects] = useState(false);
  const [restrictionStatus, setRestrictionStatus] = useState("");
  const [limitMinutes, setLimitMinutes] = useState(""); const [limitDays, setLimitDays] = useState("");
  const [easyOnly, setEasyOnly] = useState(false); const [runWalkOnly, setRunWalkOnly] = useState(false); const [noRunning, setNoRunning] = useState(false); const [unsupported, setUnsupported] = useState(false);
  const [reviewConsent, setReviewConsent] = useState(false);
  const [windowStart, setWindowStart] = useState(""); const [targetMinutes, setTargetMinutes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applyKey, setApplyKey] = useState("");
  const [savedPlan, setSavedPlan] = useState<Session[] | null>(null);
  const alive = useRef(true); const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = async () => {
    const next = negotiated(await transport.negotiate({ expectedUid, supportedSchemaVersions: [1] }), expectedUid);
    if (alive.current) setState(next);
    return next;
  };
  async function action(task: () => Promise<void>, writes = false) {
    if (lock.current || (uncertain && writes)) return;
    lock.current = true; setBusy(true); setError("");
    try { await task(); }
    catch { if (alive.current) { setError(writes ? "We couldn’t confirm that this was saved. Check the current plan before making another change." : "The current running plan is unavailable. Check your connection and try again."); if (writes) setUncertain(true); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const a = state.authority;
  let today = "";
  try {
    if (a) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: a.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      today = ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value ?? "").join("-");
    }
  } catch { /* An unknown time zone cannot make a session reportable. */ }
  const migrationScope = `${a?.revision}:${state.legacyReview?.snapshotDigest ?? "no-legacy"}`;
  const evidenceLabels: Record<string, string> = { unsupported_legacy_facts: "Some previous training details need a separate review.", legacy_recovery_indicator: "Your previous plan includes recovery.", legacy_reduced_load: "Your previous plan used reduced training.", legacy_prescriptions_retired: "Old scheduled sessions will not be reused as new prescriptions." };
  const holdLabels: Record<string, string> = { legacy_safety_review_required: "Previous training details still need review.", recovery_evidence_required: "Recovery needs a separate review.", load_review_required: "The previous reduced-load plan needs review." };
  async function saveReview() {
    if (!a || !reviewConsent || !symptoms || !restrictionStatus || (!capacityUnknown && (!capacityConfirmed || !afterEffects))) return;
    const r: AdaptationReview["restrictions"] = restrictionStatus === "specified" ? {
      status: "specified", source: "clinician", noRunning, easyOnly, runWalkOnly, unsupported,
      ...(limitMinutes ? { maxMinutes: Number(limitMinutes) } : {}), ...(limitDays ? { maxDays: Number(limitDays) } : {}),
    } : { status: restrictionStatus as "none" | "unknown" };
    const requestId = crypto.randomUUID();
    const raw = await transport.saveReview({ expectedUid, expectedRevision: a.revision, requestId, raceGoalId: a.plan.raceGoalId, confirmed: true,
      review: { symptoms, capacity: { confirmed: !capacityUnknown, afterEffectsReviewed: capacityUnknown ? afterEffects : true, daysPerWeek: capacityUnknown ? null : Number(days), longestMinutes: capacityUnknown ? null : Number(minutes) }, restrictions: r } });
    if (!alive.current) return;
    if (!record(raw) || !record(raw.receipt) || raw.receipt.accountId !== expectedUid || raw.receipt.requestId !== requestId || raw.receipt.baseRevision !== a.revision || raw.receipt.appliedRevision !== a.revision + 1) throw Error("Unverified review receipt");
    await refresh(); if (alive.current) { setReviewConsent(false); setProposal(null); setSelected([]); }
  }
  async function createPreview() {
    if (!a || a.holds.length || !windowStart || !selected.length) return;
    const raw = await transport.createPreview({ expectedUid, expectedRevision: a.revision, requestId: crypto.randomUUID(), windowStart,
      selections: selected.map((sessionId) => {
        const original = a.plan.sessions.find((s) => s.id === sessionId)!;
        return { sessionId, maxMinutes: Number(targetMinutes), format: original.kind === "run_walk" ? { kind: "run_walk", templateId: original.templateId } : { kind: "easy" } };
      }) });
    if (alive.current) { setProposal(proposalFrom(raw, a)); setApplyKey(crypto.randomUUID()); }
  }
  async function reconcile(receipt: AdaptationApplyReceipt) {
    const next = negotiated(await transport.negotiate({ expectedUid, supportedSchemaVersions: [1] }), expectedUid);
    const canonical = next.authority;
    if (!alive.current || !proposal || next.status !== "ready" || !canonical || canonical.revision !== receipt.appliedRevision || canonical.holds.length ||
      !proposal.preview.after.every((row) => canonical.plan.sessions.some((s) => s.id === row.id && s.date === row.date && s.minutes === row.minutes && s.kind === row.kind)) ||
      proposal.preview.removedIds.some((id) => canonical.plan.sessions.some((s) => s.id === id))) return false;
    setState(next); setSavedPlan(canonical.plan.sessions.filter((s) => proposal.preview.after.some((row) => row.id === s.id))); setProposal(null);
    return true;
  }
  if (!open) return <div className="ds-card space-y-2 p-4"><SectionHeading size="compact">Something affecting your running?</SectionHeading><p className="text-sm text-muted-foreground">Review your plan around what you can currently manage.</p><Button variant="sport-tinted" onClick={() => { setOpen(true); void action(async () => { await refresh(); }); }}>Review my plan</Button></div>;
  if (proposal && a) return <RunningAdaptationPreview proposal={proposal} authority={{ accountId: expectedUid, revision: a.revision, online: navigator.onLine, ready: state.status === "ready", holds: a.holds }} idempotencyKey={applyKey} apply={transport.apply} reconcile={reconcile} onEdit={() => setProposal(null)} onReviewPause={() => { setProposal(null); setError("Pausing needs a separate confirmed status change. No running hold was changed."); }} onClose={() => setOpen(false)} />;
  const initialTemplate = RUN_TEMPLATES.find((t) => t.id === "run_walk_1")!;
  const chosenInitialDates = initialDates.filter(Boolean).sort();
  const canAdoptInitial = a?.migration?.status === "complete" && !a.holds.length && !a.plan.sessions.length && a.plan.raceGoalId === null;
  const validCapacity = capacityUnknown || (Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 7 && Number(minutes) > 0 && Number(minutes) <= 1440);
  const validLimits = (!limitDays || (Number.isInteger(Number(limitDays)) && Number(limitDays) >= 1 && Number(limitDays) <= 7)) && (!limitMinutes || (Number(limitMinutes) > 0 && Number(limitMinutes) <= 1440));
  const choices = a?.plan.sessions.filter((s) => windowStart && s.date >= windowStart && Date.parse(s.date) < Date.parse(windowStart) + 7 * 86400000) ?? [];
  return <section aria-label="Review and adapt running" className="ds-card space-y-3 p-4">
    <SectionHeading>Review and adapt my plan</SectionHeading>
    <p className="text-sm text-muted-foreground">Tropos can adjust training, but can’t diagnose an injury or decide whether you’re ready to run. Follow your clinician’s instructions.</p>
    {error && <p role="alert">{error}</p>}
    {uncertain && <Button variant="secondary" disabled={busy} onClick={() => void action(async () => { await refresh(); if (alive.current) { setUncertain(false); setReviewConsent(false); setProposal(null); setSelected([]); } })}>Check current plan</Button>}
    {busy && <p role="status">Checking your running plan…</p>}
    {state.status === "not_enrolled" && <><p>Your saved history will be preserved. Existing running prescriptions will be retired for review; enrolling does not approve a new plan.</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enrollmentConsent} onChange={(e) => setEnrollmentConsent(e.target.checked)} />I want to begin this plan review.</label><Button variant="sport" disabled={!enrollmentConsent || busy || uncertain} onClick={() => void action(async () => { await transport.enroll({ expectedUid, supportedSchemaVersions: [1], confirmed: true }); if (alive.current) await refresh(); }, true)}>Begin plan review</Button></>}
    {savedPlan && <div className="ds-card space-y-2 p-3"><p role="status">Your reviewed running plan is saved.</p><ul>{savedPlan.map((s) => <li key={s.id} className="font-mono text-sm tabular-nums">{s.date} · {s.minutes} min · {s.kind === "run_walk" ? "Run/walk" : "Easy run"}</li>)}</ul></div>}
    {a && <>
      <RunningOutsideTraining expectedUid={expectedUid} authority={a} today={today}
        enabled={state.status === "ready" && !a.holds.length && !busy && !uncertain && !proposal}
        onSaved={async () => { await refresh(); if (alive.current) { setProposal(null); setSelected([]); } }} />
      {!!a.holds.length && <p role="status">Running remains paused for a separate status review. Saving answers does not clear a hold.</p>}
      {a.migration?.version === 1 && a.migration.status === "review_required" && (a.migration.legacyStateExisted === false || state.legacyReview) && <div className="space-y-2"><SectionHeading size="compact">Review previous training</SectionHeading><p className="text-sm">Saved workouts stay in your history. Completing this review retires old prescriptions; it does not create a plan or clear injury or recovery holds.</p>{state.legacyReview && <><ul className="space-y-1 text-sm">{state.legacyReview.evidence.map((e) => <li key={e}>{evidenceLabels[e] ?? "An unrecognized training detail needs a separate review."}</li>)}</ul>{state.legacyReview.holds.length > 0 && <div><p className="text-sm font-semibold">These reviews will still be required:</p><ul className="space-y-1 text-sm">{state.legacyReview.holds.map((h) => <li key={h}>{holdLabels[h] ?? "Another safety review remains required."}</li>)}</ul></div>}</>}<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={migrationConsent === migrationScope} disabled={busy || uncertain} onChange={(e) => setMigrationConsent(e.target.checked ? migrationScope : "")} />I reviewed these details and want to retire old prescriptions while keeping my history and safety holds.</label><Button variant="secondary" disabled={migrationConsent !== migrationScope || busy || uncertain} onClick={() => void action(async () => { await transport.completeMigration({ expectedUid, expectedRevision: a.revision, requestId: crypto.randomUUID(), raceGoalId: a.plan.raceGoalId, confirmed: true, acknowledgedLegacyPrescriptionsRetired: true, ...(state.legacyReview ? { expectedLegacyDigest: state.legacyReview.snapshotDigest, confirmedLegacyReview: true as const } : {}) }); if (alive.current) { await refresh(); setMigrationConsent(""); } }, true)}>Confirm previous-training review</Button></div>}
      <fieldset disabled={busy || uncertain} className="space-y-3">
        <label className="block space-y-1">How is it affecting you?<Select className="w-full" value={symptoms} onChange={(e) => setSymptoms(e.target.value)}><option value="">Choose an answer</option><option value="none">No current symptoms</option><option value="during_or_after">Symptoms during or after running</option><option value="daily_activities">Affects walking or daily activities</option><option value="concerning">Worsening or concerning symptoms</option><option value="unknown">Not sure</option></Select></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={capacityUnknown} onChange={(e) => { setCapacityUnknown(e.target.checked); setCapacityConfirmed(false); }} />I’m not sure what I can currently manage.</label>
        {["daily_activities", "concerning"].includes(symptoms) && <p role="status">Stop painful running and seek medical advice about symptoms affecting daily activities or getting worse. This review cannot clear you to run.</p>}
        <label className="block space-y-1">Days per week you can currently manage<input className="ds-input w-full" type="number" min="1" max="7" disabled={capacityUnknown} value={days} onChange={(e) => setDays(e.target.value)} /></label>
        <label className="block space-y-1">Longest comfortable session, in minutes<input className="ds-input w-full" type="number" min="1" max="1440" disabled={capacityUnknown} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={capacityConfirmed} disabled={capacityUnknown} onChange={(e) => setCapacityConfirmed(e.target.checked)} />I confirm this reflects what I can manage now.</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={afterEffects} onChange={(e) => setAfterEffects(e.target.checked)} />I have considered symptoms during and after those sessions.</label>
        <label className="block space-y-1">Have you been given training restrictions?<Select className="w-full" value={restrictionStatus} onChange={(e) => setRestrictionStatus(e.target.value)}><option value="">Choose an answer</option><option value="none">No</option><option value="specified">Yes, from a clinician</option><option value="unknown">Not sure</option></Select></label>
        {restrictionStatus === "specified" && <><label className="block">Maximum session minutes, if specified<input className="ds-input w-full" type="number" min="1" value={limitMinutes} onChange={(e) => setLimitMinutes(e.target.value)} /></label><label className="block">Maximum days per week, if specified<input className="ds-input w-full" type="number" min="1" max="7" value={limitDays} onChange={(e) => setLimitDays(e.target.value)} /></label>{[["Easy running only", easyOnly, setEasyOnly], ["Run/walk only", runWalkOnly, setRunWalkOnly], ["No running", noRunning, setNoRunning], ["Other limits this form cannot capture", unsupported, setUnsupported]].map(([label, checked, setter]) => <label key={label as string} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={checked as boolean} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} />{label as string}</label>)}</>}
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={reviewConsent} onChange={(e) => setReviewConsent(e.target.checked)} />Save these answers privately to review my running plan.</label>
        <Button variant="sport" disabled={!reviewConsent || (!capacityUnknown && (!capacityConfirmed || !afterEffects)) || !symptoms || !restrictionStatus || !validCapacity || (restrictionStatus === "specified" && !validLimits)} onClick={() => void action(saveReview, true)}>Save review answers</Button>
      </fieldset>
      {!a.holds.length && a.plan.sessions.length > 0 && <fieldset disabled={busy || uncertain} className="space-y-3"><SectionHeading size="compact">Choose the changes to preview</SectionHeading><label className="block">Start of the future week<input className="ds-input w-full" type="date" value={windowStart} onChange={(e) => { setWindowStart(e.target.value); setSelected([]); }} /></label><label className="block">Maximum session minutes<input className="ds-input w-full" type="number" min="1" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} /></label><p className="text-sm text-muted-foreground">Keep the sessions you select. Other sessions in this week will be removed. Continuous sessions become easy; run/walk sessions keep their existing structure.</p>{choices.map((s) => <label key={s.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected((prior) => e.target.checked ? [...prior, s.id] : prior.filter((id) => id !== s.id))} /><span className="font-mono tabular-nums">{s.date} · {s.minutes} min</span></label>)}<Button variant="sport" disabled={!selected.length || !targetMinutes || !windowStart} onClick={() => void action(createPreview, true)}>Preview changes</Button></fieldset>}
      {!a.holds.length && !a.plan.sessions.length && <p role="status">{a.plan.raceGoalId !== null ? "Your race goal is preserved. A race-linked starting plan needs a separate review; this flow cannot create one yet." : "Your history is preserved. A separately confirmed starting plan is needed before sessions can be adapted."}</p>}
      {canAdoptInitial && <fieldset disabled={busy || uncertain} className="space-y-3"><SectionHeading size="compact">Confirm your starting sessions</SectionHeading><p className="text-sm">Each selected date uses {initialTemplate.name}: <span className="font-mono tabular-nums">{initialTemplate.estimatedDuration} min</span> including walking. {initialTemplate.description}. This is a starting session, not medical clearance or a complete training programme.</p><p className="text-sm text-muted-foreground">Choose one to three dates in the next seven days, with a day between sessions. Dates use {a.timeZone}. Your saved capacity and clinician limits must support the whole session; no shorter session will be invented.</p>{initialDates.map((date, index) => <label className="block" key={index}>Starting session {index + 1}{index > 0 ? " (optional)" : ""}<input className="ds-input w-full" type="date" value={date} onChange={(e) => { setInitialDates((dates) => dates.map((v, i) => i === index ? e.target.value : v)); setInitialConsent(false); }} /></label>)}<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={initialConsent} onChange={(e) => setInitialConsent(e.target.checked)} />I want these exact run/walk sessions on the selected dates.</label><Button variant="sport" disabled={!initialConsent || !chosenInitialDates.length || new Set(chosenInitialDates).size !== chosenInitialDates.length} onClick={() => void action(async () => {
        const requestId = crypto.randomUUID(); const before = a.revision;
        const raw = await transport.adoptInitial({ expectedUid, expectedRevision: before, requestId, raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: chosenInitialDates });
        if (!alive.current) return;
        if (!record(raw) || !["adopted", "replayed"].includes(raw.outcome as string) || !record(raw.receipt) || raw.receipt.accountId !== expectedUid || raw.receipt.requestId !== requestId || raw.receipt.raceGoalId !== null || raw.receipt.baseRevision !== before || raw.receipt.appliedRevision !== before + 1 || !Array.isArray(raw.receipt.sessions) || raw.receipt.sessions.length !== chosenInitialDates.length || !raw.receipt.sessions.every((s) => record(s) && typeof s.id === "string" && chosenInitialDates.includes(s.date as string) && s.templateId === initialTemplate.id && s.minutes === initialTemplate.estimatedDuration && s.kind === "run_walk")) throw Error("Unverified starting-plan receipt");
        const next = await refresh(); const canonical = next.authority;
        if (!alive.current) return;
        if (next.status !== "ready" || !canonical || canonical.revision !== before + 1 || canonical.holds.length || canonical.plan.raceGoalId !== null || canonical.plan.sessions.length !== chosenInitialDates.length || !chosenInitialDates.every((date) => canonical.plan.sessions.some((s) => s.date === date && s.templateId === initialTemplate.id && s.minutes === initialTemplate.estimatedDuration && s.kind === "run_walk"))) throw Error("Starting plan needs reconciliation");
        setSavedPlan(canonical.plan.sessions); setInitialConsent(false); setInitialDates(["", "", ""]);
      }, true)}>Confirm starting plan</Button></fieldset>}
    </>}
    <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close review</Button>
  </section>;
}
