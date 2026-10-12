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
 *   - "Hide content" — mark resolved AND take the reported content out
 *     of the app: an activity is flagged and made private; a comment
 *     (activity or Space post) or a Space post is deleted. The server
 *     says which reports it can act on (`targetHideable`).
 *   - "Restrict user" — mark resolved AND restrict the target's author
 *   - Restricted accounts, each with Lift (S4e, STATUS 2026-10-06). Once a
 *     restriction stops posts, comments, props and follows, a mistaken one
 *     needs an undo that is not the Firebase console. Through the
 *     `listRestrictedUsers` and `liftRestriction` callables, which re-check
 *     admin like the queue's.
 *
 * Out of v1: pagination beyond 50, status filters
 * (pending/resolved), ban-user flow. Each is a small follow-up.
 */
import { useCallback, useEffect, useState } from "react";
import { useUid } from "@/lib/auth";
import { isAdminUid } from "@/lib/adminAuth";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { toast } from "@/lib/toast";
import type { ReportTargetType } from "@/lib/socialApi";
import { formatDayMonthYear } from "@/utils/formatters";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Loader2, ShieldAlert, EyeOff, Check, UserX } from "lucide-react";

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
  title?: string | null;
  body?: string | null;
  spaceId?: string;
  postId?: string;
}

interface Report {
  reportId: string;
  reporterId: string | null;
  /** Packet 14 — CANONICAL type, server-resolved from the authority marker.
   *  null for a legacy / non-actionable report (see targetActionable). */
  targetType: ReportTargetType | null;
  targetId: string | null;
  targetUid: string | null;
  /** True iff the server re-resolved a live target from a valid authority
   *  marker — the ONLY reports on which hide/restrict may be applied. */
  targetActionable: boolean;
  /** True iff Hide content can act on it: a live activity, comment, Space
   *  post or Space comment (reportTargets.HIDEABLE_TARGET_TYPES). Absent
   *  from a server older than the field. */
  targetHideable?: boolean;
  /** Display-only diagnostics from the stored (untrusted) report doc. They
   *  never select a target for an action. */
  reportedTargetType: string | null;
  reportedTargetId: string | null;
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

/** What was reported, for the card header. The target type is a storage
 *  key, not a label. */
const TARGET_LABEL: Record<ReportTargetType, string> = {
  activity: "Activity",
  comment: "Comment",
  user: "Profile",
  space_post: "Space post",
  space_post_comment: "Space comment",
};

/** Whether Hide content applies. The server decides; a server older than
 *  `targetHideable` could hide activities only. */
function canHide(report: Report): boolean {
  if (!report.targetActionable) return false;
  return report.targetHideable ?? report.targetType === "activity";
}

/** An account under a restriction, as `listRestrictedUsers` returns it. */
interface RestrictedAccount {
  uid: string;
  displayName: string | null;
  restrictedAt: number | null;
  lastActionedReport: string | null;
}

/** One read of the restricted accounts through the admin-gated callable. */
async function readRestrictedAccounts(): Promise<RestrictedAccount[]> {
  const callable = httpsCallable<unknown, { restricted: RestrictedAccount[] }>(
    functions,
    "listRestrictedUsers"
  );
  const result = await callable({});
  return result.data.restricted;
}

/** One read of the pending queue through the admin-gated callable. */
async function readPendingReports(): Promise<Report[]> {
  const callable = httpsCallable<unknown, { reports: Report[] }>(
    functions,
    "listPendingReports"
  );
  const result = await callable({});
  return result.data.reports;
}

function targetPreview(report: Report): string {
  const t = report.target;
  if (!t) return "(target unavailable)";
  if (
    report.targetType === "comment" ||
    report.targetType === "space_post_comment"
  )
    return t.text || "(empty comment)";
  if (report.targetType === "user") return t.displayName || "(user)";
  if (report.targetType === "space_post")
    return t.title || t.body || "(empty post)";
  return (
    t.caption ||
    t.workoutName ||
    t.runName ||
    `(${t.type || "activity"} with no caption)`
  );
}

export default function AdminModeration() {
  const uid = useUid();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [restricted, setRestricted] = useState<RestrictedAccount[] | null>(
    null
  );
  const [restrictedError, setRestrictedError] = useState<string | null>(null);
  const [liftTarget, setLiftTarget] = useState<RestrictedAccount | null>(null);
  const [liftingUid, setLiftingUid] = useState<string | null>(null);

  const isAdmin = isAdminUid(uid);

  // Commits only when the read settles. The mount needs nothing cleared
  // first: `reports` starts null and `error` empty, which is the loading
  // state. Refresh clears them itself before calling this.
  const loadReports = useCallback(
    () =>
      readPendingReports().then(setReports, (err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load reports.";
        setError(message);
      }),
    []
  );

  const refreshReports = () => {
    setError(null);
    setReports(null);
    void loadReports();
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadReports();
  }, [isAdmin, loadReports]);

  // Same shape as the queue's read: commits when it settles.
  const loadRestricted = useCallback(
    () =>
      readRestrictedAccounts().then(
        (rows) => {
          setRestrictedError(null);
          setRestricted(rows);
        },
        (err: unknown) => {
          setRestrictedError(
            err instanceof Error
              ? err.message
              : "Failed to load restricted accounts."
          );
        }
      ),
    []
  );

  useEffect(() => {
    if (!isAdmin) return;
    void loadRestricted();
  }, [isAdmin, loadRestricted]);

  const lift = async (account: RestrictedAccount) => {
    setLiftTarget(null);
    setLiftingUid(account.uid);
    try {
      const callable = httpsCallable<
        { uid: string },
        { ok: boolean; lifted: boolean }
      >(functions, "liftRestriction");
      await callable({ uid: account.uid });
      toast.success("Restriction lifted.");
      setRestricted((prev) =>
        prev ? prev.filter((r) => r.uid !== account.uid) : prev
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lift failed.");
    } finally {
      setLiftingUid(null);
    }
  };

  /* S4e (PR #722): resolveReport callable gains optional `restrictUser`
     param. Admin queue UI gets a third button (Restrict user) alongside
     Dismiss + Hide content. Restricting writes to globalRestrictedUids/
     {targetUid} atomically with the report resolution. */
  const resolveReport = async (
    reportId: string,
    hideActivity: boolean,
    restrictUser: boolean = false
  ) => {
    setBusyReportId(reportId);
    try {
      const callable = httpsCallable<
        { reportId: string; hideActivity: boolean; restrictUser?: boolean },
        { ok: boolean }
      >(functions, "resolveReport");
      await callable({ reportId, hideActivity, restrictUser });
      const msg = restrictUser
        ? hideActivity
          ? "Hidden, user restricted, and resolved."
          : "User restricted and resolved."
        : hideActivity
          ? "Hidden and resolved."
          : "Resolved.";
      toast.success(msg);
      // Optimistic: drop the report from the visible list rather
      // than re-fetching every time — the user can tap Refresh
      // for a clean re-read.
      setReports((prev) =>
        prev ? prev.filter((r) => r.reportId !== reportId) : prev
      );
      if (restrictUser) void loadRestricted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed.";
      toast.error(message);
    } finally {
      setBusyReportId(null);
    }
  };

  if (!uid) {
    return (
      <div className="px-4 pt-[calc(var(--safe-top)+2rem)] pb-8 max-w-md mx-auto">
        <h1 className="text-xl font-extrabold mb-2">Moderation</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue.</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="px-4 pt-[calc(var(--safe-top)+2rem)] pb-8 max-w-md mx-auto">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="size-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-xl font-extrabold">Not authorised</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This page is for Tropos moderators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-6 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Moderation queue</h1>
        <button
          type="button"
          onClick={refreshReports}
          className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground font-semibold active:scale-95 transition-transform"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="text-sm text-destructive-strong font-medium"
        >
          {error}
        </div>
      )}

      {reports === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>Loading pending reports…</span>
        </div>
      )}

      {reports && reports.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Check className="size-8 text-muted-foreground mx-auto mb-3" />
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
                      {report.targetType
                        ? TARGET_LABEL[report.targetType]
                        : (report.reportedTargetType ?? "unknown")}{" "}
                      · {REASON_LABEL[report.reason]}
                    </p>
                    <p className="text-caption font-mono tabular-nums text-muted-foreground mt-0.5">
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
                    <p className="text-caption text-warning-strong mt-1.5 font-medium">
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

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveReport(report.reportId, false)}
                    className="flex-1 min-w-[6rem] text-sm font-semibold px-3 py-2 rounded-lg bg-muted text-foreground active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  {!report.targetActionable && (
                    <p className="text-caption text-muted-foreground mt-1.5 basis-full">
                      Target could not be revalidated. Dismiss only; no content
                      action can be applied.
                    </p>
                  )}
                  {canHide(report) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resolveReport(report.reportId, true)}
                      className="flex-1 min-w-[6rem] text-sm font-semibold px-3 py-2 rounded-lg bg-destructive text-destructive-foreground active:scale-95 transition-transform disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <EyeOff className="size-3.5" aria-hidden="true" />
                      Hide content
                    </button>
                  )}
                  {/* Restrict user — writes globalRestrictedUids/{targetUid}
                      atomically with resolution. Gated on targetActionable so
                      a non-revalidated report can never restrict a user. */}
                  {report.targetActionable && report.targetUid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void resolveReport(report.reportId, false, true)
                      }
                      aria-label="Restrict user — they can't post, comment or follow anyone until the restriction is lifted."
                      className="flex-1 min-w-[6rem] text-sm font-semibold px-3 py-2 rounded-lg bg-destructive/80 text-destructive-foreground active:scale-95 transition-transform disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <UserX className="size-3.5" aria-hidden="true" />
                      Restrict user
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="restricted-heading" className="space-y-3 pt-4">
        <h2 id="restricted-heading" className="text-lg font-extrabold">
          Restricted accounts
        </h2>
        {restrictedError && (
          <div
            role="alert"
            className="text-sm text-destructive-strong font-medium"
          >
            {restrictedError}
          </div>
        )}
        {restricted === null && !restrictedError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            <span>Loading restricted accounts…</span>
          </div>
        )}
        {restricted && restricted.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No account is restricted.
          </p>
        )}
        {restricted && restricted.length > 0 && (
          <ul className="space-y-2">
            {restricted.map((account) => (
              <li
                key={account.uid}
                className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 basis-[12em] min-w-0">
                  <p className="text-sm font-semibold text-foreground break-words">
                    {account.displayName ?? "(no name)"}
                  </p>
                  <p className="text-caption font-mono text-muted-foreground break-all">
                    {account.uid}
                  </p>
                  {account.restrictedAt !== null && (
                    <p className="text-caption text-muted-foreground mt-0.5">
                      Restricted{" "}
                      {formatDayMonthYear(new Date(account.restrictedAt))}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  loading={liftingUid === account.uid}
                  onClick={() => setLiftTarget(account)}
                  aria-label={`Lift the restriction on ${account.displayName ?? account.uid}`}
                >
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={liftTarget !== null}
        title="Lift this restriction?"
        description="They can post, comment, give props and follow people again straight away."
        confirmLabel="Lift"
        onConfirm={() => {
          if (liftTarget) void lift(liftTarget);
        }}
        onCancel={() => setLiftTarget(null)}
      />
    </div>
  );
}
