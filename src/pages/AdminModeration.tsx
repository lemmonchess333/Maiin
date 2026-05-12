/**
 * Admin moderation queue page.
 *
 * Hidden behind `VITE_ADMIN_UIDS` (client-side gate) — non-admin
 * users get a 403 placeholder. The actual report fetch goes
 * through the `listPendingReports` callable which re-checks
 * admin via `ADMIN_UIDS` on the server, so a curl-wielding
 * non-admin can't bypass.
 *
 * v1 surface:
 *   - List of pending reports, newest first, capped at 50
 *   - Per-report card showing reason, reporter, target preview
 *     (joined server-side so the page doesn't need read access
 *     to /reports/ or to other users' activities)
 *   - "Dismiss" — mark resolved, leave target alone
 *   - "Hide content" — mark resolved AND set target.flagged +
 *     visibility: 'private'
 *
 * Out of v1: pagination beyond 50, status filters
 * (pending/resolved), ban-user flow, target-comment delete.
 * Each is a small follow-up.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isAdminUid } from "@/lib/adminAuth";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { toast } from "sonner";
import { Loader2, ShieldAlert, EyeOff, Check } from "lucide-react";

interface ReportTarget {
  authorId?: string;
  authorName?: string | null;
  type?: string;
  caption?: string | null;
  workoutName?: string | null;
  runName?: string | null;
  text?: string | null;
  uid?: string;
  displayName?: string | null;
  activityId?: string;
  visibility?: string | null;
  flagged?: boolean;
}

interface Report {
  reportId: string;
  reporterId: string;
  targetType: "activity" | "comment" | "user";
  targetId: string;
  reason: "spam" | "harassment" | "inappropriate" | "other";
  details: string | null;
  createdAt: number | null;
  target: ReportTarget | null;
}

const REASON_LABEL: Record<Report["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  other: "Other",
};

function targetPreview(report: Report): string {
  const t = report.target;
  if (!t) return "(target unavailable)";
  if (report.targetType === "comment") return t.text || "(empty comment)";
  if (report.targetType === "user") return t.displayName || "(user)";
  return (
    t.caption ||
    t.workoutName ||
    t.runName ||
    `(${t.type || "activity"} with no caption)`
  );
}

export default function AdminModeration() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const isAdmin = isAdminUid(user?.uid);

  const fetchReports = useCallback(async () => {
    setError(null);
    setReports(null);
    try {
      const callable = httpsCallable<unknown, { reports: Report[] }>(
        functions,
        "listPendingReports",
      );
      const result = await callable({});
      setReports(result.data.reports);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load reports.";
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchReports();
  }, [isAdmin, fetchReports]);

  const resolveReport = async (reportId: string, hideActivity: boolean) => {
    setBusyReportId(reportId);
    try {
      const callable = httpsCallable<{ reportId: string; hideActivity: boolean }, { ok: boolean }>(
        functions,
        "resolveReport",
      );
      await callable({ reportId, hideActivity });
      toast.success(hideActivity ? "Hidden and resolved." : "Resolved.");
      // Optimistic: drop the report from the visible list rather
      // than re-fetching every time — the user can tap Refresh
      // for a clean re-read.
      setReports((prev) => (prev ? prev.filter((r) => r.reportId !== reportId) : prev));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Action failed.";
      toast.error(message);
    } finally {
      setBusyReportId(null);
    }
  };

  if (!user) {
    return (
      <div className="px-4 py-8 max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-2">Moderation</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue.</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="px-4 py-8 max-w-md mx-auto">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-base font-semibold">Not authorised</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This page is for Tropos moderators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Moderation queue</h1>
        <button
          type="button"
          onClick={() => void fetchReports()}
          className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground font-semibold active:scale-95 transition-transform"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="text-sm text-destructive font-medium">
          {error}
        </div>
      )}

      {reports === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Loading pending reports…</span>
        </div>
      )}

      {reports && reports.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Check className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold">All clear.</p>
          <p className="text-xs text-muted-foreground mt-1">
            No pending reports.
          </p>
        </div>
      )}

      {reports && reports.length > 0 && (
        <ul className="space-y-3">
          {reports.map((report) => {
            const busy = busyReportId === report.reportId;
            return (
              <li
                key={report.reportId}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                <header className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {report.targetType} · {REASON_LABEL[report.reason]}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-muted-foreground/70 mt-0.5">
                      {report.createdAt
                        ? new Date(report.createdAt).toISOString()
                        : "(unknown date)"}
                    </p>
                  </div>
                </header>

                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-1">Target</p>
                  <p className="text-sm text-foreground break-words">
                    {targetPreview(report)}
                  </p>
                  {report.target?.flagged === true && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 font-medium">
                      Already flagged by auto-filter
                    </p>
                  )}
                </div>

                {report.details && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-1">
                      Reporter note
                    </p>
                    <p className="text-sm text-foreground break-words">
                      {report.details}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveReport(report.reportId, false)}
                    className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-muted text-foreground active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  {report.targetType === "activity" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resolveReport(report.reportId, true)}
                      className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-destructive text-destructive-foreground active:scale-95 transition-transform disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      Hide content
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
