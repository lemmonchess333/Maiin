import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import type { AdaptationPreview } from "@/features/program/runningAdaptationPreview";
import {
  RUNNING_ADAPTATION_ENABLED, matchingAdaptationReceipt,
  type AdaptationApplyReceipt, type AdaptationApplyRequest, type AdaptationApplyResponse,
} from "@/features/program/runningAdaptationApply";

interface Props {
  /** Must come from an authenticated server proposal, never local draft authority. */
  proposal: { id: string; expiresAtMs: number; preview: Extract<AdaptationPreview, { status: "preview" }> };
  authority: { accountId: string; revision: number; online: boolean; ready: boolean; holds: readonly string[] };
  /** Key allocated and retained by the proposal owner across remounts/reconciliation. */
  idempotencyKey: string;
  apply: (request: AdaptationApplyRequest) => Promise<AdaptationApplyResponse>;
  /** Must re-read canonical authority before allowing any updated plan to paint. */
  reconcile: (receipt: AdaptationApplyReceipt) => Promise<boolean>;
  onEdit: () => void;
  onReviewPause: () => void;
  onClose: () => void;
}

/** Production entry stays invisible until backend, compatibility and clinical review. */
export default function RunningAdaptationPreview(props: Props) {
  if (!RUNNING_ADAPTATION_ENABLED) return null;
  return <RunningAdaptationPreviewCandidate {...props} />;
}

/** Keyed preview contents shared by the gated settings flow and fixture tests. */
export function RunningAdaptationPreviewCandidate(props: Props) {
  const identity = `${props.authority.accountId}:${props.authority.revision}:${props.proposal.id}:${props.proposal.preview.accountId}:${props.proposal.preview.revision}:${props.authority.ready}:${props.authority.online}:${props.authority.holds.join(",")}:${props.proposal.expiresAtMs}:${props.idempotencyKey}:${JSON.stringify(props.proposal.preview)}`;
  return <PreviewContents key={identity} {...props} />;
}

function PreviewContents({ proposal, authority, idempotencyKey, apply, reconcile, onEdit, onReviewPause, onClose }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "saving" | "reconciling" | "saved" | "uncertain">("idle");
  const [expired, setExpired] = useState(() => Date.now() >= proposal.expiresAtMs);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const remaining = proposal.expiresAtMs - Date.now();
    const timer = setTimeout(() => setExpired(true), Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timer);
  }, [proposal.expiresAtMs]);
  const preview = proposal.preview;
  const eligible = authority.ready && authority.online && !authority.holds.length &&
    authority.accountId === preview.accountId && authority.revision === preview.revision &&
    Number.isSafeInteger(preview.revision) && preview.revision >= 0 && !!proposal.id && !!idempotencyKey &&
    Number.isFinite(proposal.expiresAtMs) && !expired;
  const busy = phase === "saving" || phase === "reconciling";
  async function submit() {
    if (lock.current || !accepted || !eligible || Date.now() >= proposal.expiresAtMs || phase !== "idle") return;
    lock.current = true;
    setPhase("saving");
    const request: AdaptationApplyRequest = { expectedUid: authority.accountId, accepted: true, proposalId: proposal.id, expectedRevision: preview.revision, idempotencyKey };
    try {
      const response = await apply(request);
      if (!alive.current) return;
      if (!matchingAdaptationReceipt(request, response)) { setPhase("uncertain"); return; }
      setPhase("reconciling");
      const confirmed = await reconcile(response.receipt);
      if (alive.current) setPhase(confirmed ? "saved" : "uncertain");
    } catch {
      if (alive.current) setPhase("uncertain");
    }
    // No unlocked retry: uncertain outcomes require canonical reconciliation.
  }
  const kinds = { easy: "Easy run", run_walk: "Run/walk", quality: "Quality session", long: "Long run" };
  return <section aria-label="Review running changes" className="space-y-3 bg-background p-4 text-foreground">
    <SectionHeading>Your proposed plan</SectionHeading>
    <p className="text-sm text-muted-foreground">Review these changes before applying them. This is not medical clearance. Follow any instructions from your clinician.</p>
    <div className="ds-card space-y-2 p-4">
      <p>Running days: <span className="font-mono tabular-nums">{preview.days.before} → {preview.days.after}</span></p>
      <p>Longest session: <span className="font-mono tabular-nums">{preview.longestMinutes.before} → {preview.longestMinutes.after} min</span></p>
    </div>
    <ul className="space-y-2" aria-label="Session changes">{preview.before.map((before) => {
      const after = preview.after.find((s) => s.id === before.id);
      return <li key={before.id} className="ds-card space-y-1 p-3">
        <p className="font-mono text-sm tabular-nums">{before.date}</p>
        <p className="text-sm">Before: {kinds[before.kind]} · <span className="font-mono tabular-nums">{before.minutes} min</span></p>
        <p className="text-sm">After: {after ? <>{kinds[after.kind]} · <span className="font-mono tabular-nums">{after.minutes} min</span></> : "No planned run"}</p>
      </li>;
    })}</ul>
    <div className="ds-card space-y-2 p-4">
      <SectionHeading size="compact">Your race goal</SectionHeading>
      <p className="text-sm text-muted-foreground">{preview.raceGoalId ? "Your saved race goal stays unchanged. These changes need a separate race-goal review; they do not establish readiness for the race." : "No race goal is attached to this review."}</p>
    </div>
    {!eligible && <p role="alert">This preview needs a fresh review before it can be applied. Check your connection and any active running holds.</p>}
    {phase === "uncertain" && <p role="alert">We couldn’t confirm whether the changes were saved. Check your saved plan before trying again.</p>}
    <p role="status" aria-live="polite">{phase === "saving" ? "Saving your confirmed changes…" : phase === "reconciling" ? "Checking your saved plan…" : phase === "saved" ? "Your saved plan has been checked." : ""}</p>
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" checked={accepted} disabled={!eligible || phase !== "idle"} onChange={(e) => setAccepted(e.target.checked)} />
      Apply exactly the session changes shown above.
    </label>
    <Button variant="sport" fullWidth loading={busy} disabled={!eligible || !accepted || phase !== "idle"} onClick={() => void submit()}>Apply changes</Button>
    <Button variant="secondary" fullWidth disabled={busy || phase === "uncertain"} onClick={onEdit}>Edit answers</Button>
    <Button variant="ghost" fullWidth disabled={busy} onClick={onReviewPause}>Review pausing running</Button>
    <Button variant="ghost" fullWidth disabled={busy} onClick={onClose}>Close</Button>
  </section>;
}
