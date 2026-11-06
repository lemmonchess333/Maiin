import Button from "@/components/ui/Button";
import { useRef, useState } from "react";
import OutsideTrainingReportForm from "./OutsideTrainingReportForm";
import { submitOutsideTrainingReport } from "@/features/program/outsideTrainingTransport";

type AcceptedSession = { id: string; date: string; templateId: string; minutes: number; kind: string };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const calendarDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Entry point only for explicitly accepted initial stage-one plans. No stage
 * is inferred from a proposed plan or template. Server revalidates its receipt. */
export default function RunningOutsideTraining({ expectedUid, authority, today, enabled, onSaved }: {
  expectedUid: string;
  authority: unknown;
  today: string;
  enabled: boolean;
  onSaved?: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const commands = useRef(new Map<string, string>());
  if (!enabled || !calendarDate(today) || !record(authority) || authority.accountId !== expectedUid || authority.schemaVersion !== 1 ||
      !Number.isSafeInteger(authority.revision) || (authority.revision as number) < 1 || !record(authority.plan) || authority.plan.raceGoalId !== null ||
      !Array.isArray(authority.plan.sessions) || !record(authority.acceptedRunWalkStage)) return null;
  const scope = authority.acceptedRunWalkStage;
  if (scope.version !== 1 || scope.stage !== 1 || scope.raceGoalId !== null || !identifier(scope.adoptionRequestId) ||
      !Number.isSafeInteger(scope.adoptedAtRevision) || (scope.adoptedAtRevision as number) < 1 || (scope.adoptedAtRevision as number) > (authority.revision as number) ||
      !Array.isArray(scope.sessionIds) || !scope.sessionIds.length || scope.sessionIds.length > 3 || !scope.sessionIds.every(identifier) || new Set(scope.sessionIds).size !== scope.sessionIds.length) return null;
  const sessions: AcceptedSession[] = [];
  for (const id of scope.sessionIds) {
    const matches = authority.plan.sessions.filter((s: unknown) => record(s) && s.id === id);
    const s = matches[0];
    if (matches.length !== 1 || !record(s) || !calendarDate(s.date) || s.templateId !== "run_walk_1" || s.minutes !== 29 || s.kind !== "run_walk") return null;
    if (s.date <= today) sessions.push({ id, date: s.date, templateId: s.templateId, minutes: s.minutes, kind: s.kind });
  }
  if (!sessions.length) return null;
  const session = sessions.find(s => s.id === selected);
  return <section aria-label="Report outside training">
    <p className="text-sm text-muted-foreground">Ran outside Tropos? Report what you did. This will not mark a planned run complete or advance your plan.</p>
    {!session ? <div className="flex flex-wrap gap-2">
      {sessions.map(s => <Button key={s.id} type="button" variant="outline" onClick={() => setSelected(s.id)}>Report training for {s.date}</Button>)}
    </div> : <OutsideTrainingReportForm expectedUid={expectedUid} stage={1} date={session.date} today={today}
      onSaved={onSaved} expectedAuthorityRevision={authority.revision as number} raceGoalId={null} scheduledRunId={session.id}
      onSubmit={async submission => {
        const key = `${submission.expectedUid}:${submission.report.activityId}`;
        let command = commands.current.get(key);
        if (!command) { command = crypto.randomUUID(); commands.current.set(key, command); }
        return submitOutsideTrainingReport(submission, command);
      }} />}
  </section>;
}
