import { sameStoredValue } from "@/features/program/stateTransition";
import { useId, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { STARTER_STAGE_TEMPLATE_IDS } from "@/features/program/starterPlan";
import {
  reconcileNoviceTrainingEvidence,
  type NoviceTrainingReport,
} from "@/features/program/noviceTrainingEvidence";

export interface OutsideTrainingSubmission {
  expectedUid: string;
  confirmationVersion: "outside-training-report-v1";
  expectedAuthorityRevision: number;
  raceGoalId: string | null;
  scheduledRunId: string;
  report: NoviceTrainingReport;
}

export interface OutsideTrainingReceipt {
  accountId: string;
  raceGoalId: string | null;
  scheduledRunId: string;
  report: NoviceTrainingReport;
  activityId: string;
  authorityRevision: number;
}

/** Inactive until a parent supplies an authenticated reporting adapter. Never
 * calls the completion writer or modifies a plan/capacity confirmation. */
export default function OutsideTrainingReportForm({
  expectedUid,
  stage,
  date,
  today,
  expectedAuthorityRevision,
  raceGoalId,
  scheduledRunId,
  onSubmit,
  onSaved,
}: {
  expectedUid: string;
  stage: number;
  date: string;
  today: string;
  expectedAuthorityRevision: number;
  raceGoalId: string | null;
  scheduledRunId: string;
  onSaved?: () => Promise<void>;
  onSubmit: (
    submission: OutsideTrainingSubmission
  ) => Promise<OutsideTrainingReceipt>;
}) {
  const id = useId();
  const [scope] = useState({
    expectedUid,
    date,
    stage,
    expectedAuthorityRevision,
    raceGoalId,
    scheduledRunId,
  });
  const stale =
    scope.expectedUid !== expectedUid ||
    scope.date !== date ||
    scope.stage !== stage ||
    scope.expectedAuthorityRevision !== expectedAuthorityRevision ||
    scope.raceGoalId !== raceGoalId ||
    scope.scheduledRunId !== scheduledRunId;

  const [activityId] = useState(() => `outside:${crypto.randomUUID()}`);
  const [reportedDate, setReportedDate] = useState(date);
  const [minutes, setMinutes] = useState("");
  const [effort, setEffort] = useState("");
  const [completed, setCompleted] = useState("");
  const [manageable, setManageable] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const template = RUN_TEMPLATES.find(
    (item) => item.id === STARTER_STAGE_TEMPLATE_IDS[scope.stage - 1]
  );
  if (scope.expectedUid !== expectedUid)
    return (
      <p role="alert">
        The signed-in account changed. Close this sheet before reporting
        training.
      </p>
    );
  if (!template)
    return (
      <p role="alert">
        Review your current stage before reporting this session.
      </p>
    );
  if (saved)
    return (
      <p role="status">
        Training report saved. Your plan and completion ticks have not changed.
      </p>
    );
  return (
    <form
      aria-label="Report outside training"
      className="space-y-3 rounded-xl border border-border p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current) return;
        if (stale) {
          setError(
            "Your plan changed. Your answers are still here; close this sheet and review the latest plan before reporting."
          );
          return;
        }
        if (
          !confirmed ||
          !effort ||
          !completed ||
          !manageable ||
          !minutes.trim()
        ) {
          setError(
            "Complete each answer and confirm the details before saving."
          );
          return;
        }
        const report: NoviceTrainingReport = {
          activityId,
          date: reportedDate,
          source: "outside_session",
          durationSeconds: Number(minutes) * 60,
          relativeEffort:
            effort === "unknown"
              ? null
              : (effort as "easier" | "matched" | "harder"),
          ...(completed !== "unknown"
            ? { sessionCompletedAsDescribed: completed === "yes" }
            : {}),
          ...(completed === "yes" ? { completedStage: scope.stage } : {}),
          ...(manageable !== "unknown"
            ? { manageable: manageable === "yes" }
            : {}),
        };
        if (
          !reconcileNoviceTrainingEvidence([report], [], today).accepted.length
        ) {
          setError(
            "Check the date and duration. A full-session report must include its warm-up, walking and cool-down. You can report a shorter session as not completed as described."
          );
          return;
        }
        locked.current = true;
        setBusy(true);
        setError("");
        try {
          const receipt = await onSubmit({
            expectedUid: scope.expectedUid,
            confirmationVersion: "outside-training-report-v1",
            expectedAuthorityRevision: scope.expectedAuthorityRevision,
            raceGoalId: scope.raceGoalId,
            scheduledRunId: scope.scheduledRunId,
            report,
          });
          if (
            receipt.accountId !== scope.expectedUid ||
            receipt.raceGoalId !== scope.raceGoalId ||
            receipt.scheduledRunId !== scope.scheduledRunId ||
            receipt.activityId !== activityId ||
            !sameStoredValue(receipt.report, report) ||
            !Number.isInteger(receipt.authorityRevision) ||
            receipt.authorityRevision <= expectedAuthorityRevision
          ) {
            throw new Error("Unconfirmed reporting receipt");
          }
          setSaved(true);
          // A refresh failure must not turn a durable save into a failed-save claim.
          if (onSaved) await onSaved().catch(() => undefined);
        } catch {
          // A rejected or uncertain write must not be represented as saved. Keep
          // the same activity identity for a deliberate retry; server receipts
          // must make that retry idempotent.
          setError(
            "The report was not confirmed saved. Your answers are still here. Check your connection or review the latest plan before trying again."
          );
        } finally {
          locked.current = false;
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold text-sm">Report outside training</p>
      <p className="text-xs text-muted-foreground">
        For {template.name}. Saving records what you report. It does not advance
        your plan, change a hold, or mark this session as done.
      </p>
      <fieldset disabled={busy || stale} className="space-y-3">
        <label className="block text-sm" htmlFor={`${id}-date`}>
          Date
          <input
            className="ds-input w-full"
            id={`${id}-date`}
            type="date"
            max={today}
            required
            value={reportedDate}
            onChange={(event) => setReportedDate(event.target.value)}
          />
        </label>
        <label className="block text-sm" htmlFor={`${id}-minutes`}>
          Total session minutes
          <input
            className="ds-input w-full"
            id={`${id}-minutes`}
            type="number"
            min="0.1"
            max="1440"
            step="0.1"
            required
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Include warm-up, walking and cool-down. A shorter session can still be
          reported.
        </p>
        <label className="block text-sm" htmlFor={`${id}-effort`}>
          How did it feel compared with the planned session?
          <Select
            id={`${id}-effort`}
            required
            value={effort}
            onChange={(event) => setEffort(event.target.value)}
          >
            <option value="">Choose an answer</option>
            <option value="easier">Easier</option>
            <option value="matched">As expected</option>
            <option value="harder">Harder</option>
            <option value="unknown">Not sure</option>
          </Select>
        </label>
        <label className="block text-sm" htmlFor={`${id}-completed`}>
          Did you complete this session as described?
          <Select
            id={`${id}-completed`}
            required
            value={completed}
            onChange={(event) => setCompleted(event.target.value)}
          >
            <option value="">Choose an answer</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unknown">Not sure</option>
          </Select>
        </label>
        <label className="block text-sm" htmlFor={`${id}-manageable`}>
          Did the session feel manageable?
          <Select
            id={`${id}-manageable`}
            required
            value={manageable}
            onChange={(event) => setManageable(event.target.value)}
          >
            <option value="">Choose an answer</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unknown">Not sure</option>
          </Select>
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm these details describe my training and want to save this
          report to my account.
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl border border-border py-3 text-sm font-bold"
        >
          {busy ? "Saving report…" : "Save training report"}
        </button>
      </fieldset>
      {stale && (
        <p role="status" className="text-sm text-muted-foreground">
          Your plan changed. Your answers are still here. Close this sheet and
          review the latest plan before reporting.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-strong">
          {error}
        </p>
      )}
    </form>
  );
}
