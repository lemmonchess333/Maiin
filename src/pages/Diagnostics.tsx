import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAppCheckToken, isAppCheckActive } from "@/lib/appCheck";
import {
  getNotificationPermissionState,
  getPendingNotifications,
  type NotificationPermissionState,
  type PendingNotification,
} from "@/lib/notifications";
import { getQueueLength } from "@/lib/offlineQueue";
import { useAuth } from "@/lib/auth";

declare const __APP_VERSION__: string;

/**
 * Operator diagnostics — hidden route at /diagnostics. Not linked
 * from any nav surface. Surfaces app version, build mode, service-
 * worker registration state, App Check status (+ truncated token
 * snippet), notification permission, count of pending OS-scheduled
 * notifications, offline write queue depth, and the signed-in UID.
 *
 * Purpose: when a user reports a stuck push notification, missing
 * SW update, or App Check enforcement failure in the field, the
 * support flow is "open /diagnostics and read me the values". No
 * dev tools, no terminal — every signal the operator needs to
 * diagnose a problem renders here.
 *
 * Token snippet is intentionally truncated (head/tail) so a
 * screenshot doesn't leak a usable App Check token. The full token
 * never appears in the DOM.
 */

interface SwState {
  registered: boolean;
  scope: string | null;
  active: boolean;
  waiting: boolean;
  installing: boolean;
}

async function readSwState(): Promise<SwState> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { registered: false, scope: null, active: false, waiting: false, installing: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { registered: false, scope: null, active: false, waiting: false, installing: false };
    return {
      registered: true,
      scope: reg.scope ?? null,
      active: !!reg.active,
      waiting: !!reg.waiting,
      installing: !!reg.installing,
    };
  } catch {
    return { registered: false, scope: null, active: false, waiting: false, installing: false };
  }
}

function truncateToken(token: string): string {
  if (token.length <= 16) return "<short>";
  return `${token.slice(0, 8)}…${token.slice(-8)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <p className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">{label}</p>
      <p className="text-xs font-mono text-foreground text-right break-all">{value}</p>
    </div>
  );
}

export default function Diagnostics() {
  const { user } = useAuth();
  const [swState, setSwState] = useState<SwState | null>(null);
  const [appCheckToken, setAppCheckToken] = useState<string | null | "loading">(() =>
    isAppCheckActive() ? "loading" : null,
  );
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [pending, setPending] = useState<PendingNotification[] | null>(null);
  const [queueLength] = useState<number>(() => getQueueLength());

  useEffect(() => {
    readSwState().then(setSwState);
    getNotificationPermissionState().then(setPermission);
    getPendingNotifications().then(setPending);
    if (isAppCheckActive()) {
      getAppCheckToken().then((result) => {
        if (!result) {
          setAppCheckToken(null);
          return;
        }
        setAppCheckToken(result.token);
      });
    }
  }, []);

  const buildMode = import.meta.env.MODE;
  const swSummary = swState
    ? swState.registered
      ? `${swState.active ? "active" : "idle"}${swState.waiting ? " · waiting" : ""}${swState.installing ? " · installing" : ""}`
      : "not registered"
    : "checking…";

  const appCheckSummary = (() => {
    if (appCheckToken === "loading") return "checking…";
    if (appCheckToken === null) {
      return isAppCheckActive() ? "no token" : "inactive";
    }
    return truncateToken(appCheckToken);
  })();

  const permissionSummary = permission ?? "checking…";
  const pendingSummary = pending === null ? "checking…" : `${pending.length} scheduled`;

  return (
    <div className="min-h-screen bg-background px-4 pt-12 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Diagnostics</h1>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Home
          </Link>
        </div>

        <section className="bg-card rounded-2xl p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">App</p>
          <Row label="Version" value={`v${__APP_VERSION__}`} />
          <Row label="Build" value={buildMode} />
          <Row label="UID" value={user?.uid ?? "<not signed in>"} />
        </section>

        <section className="bg-card rounded-2xl p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">Service Worker</p>
          <Row label="State" value={swSummary} />
          {swState?.scope && <Row label="Scope" value={swState.scope} />}
        </section>

        <section className="bg-card rounded-2xl p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">App Check</p>
          <Row label="Token" value={appCheckSummary} />
        </section>

        <section className="bg-card rounded-2xl p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">Notifications</p>
          <Row label="Permission" value={permissionSummary} />
          <Row label="Pending" value={pendingSummary} />
          {pending && pending.length > 0 && (
            <div className="pt-2 space-y-2">
              {pending.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg bg-muted px-3 py-2 text-xs font-mono space-y-0.5"
                >
                  <p className="text-foreground">
                    #{n.id} {n.title ?? "<no title>"}
                  </p>
                  <p className="text-muted-foreground">
                    {n.scheduleAt ?? "<no schedule>"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card rounded-2xl p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">Offline Queue</p>
          <Row label="Depth" value={`${queueLength} pending`} />
          <Row label="Online" value={typeof navigator !== "undefined" && navigator.onLine ? "yes" : "no"} />
        </section>

        <p className="text-center text-xs text-muted-foreground/60 pt-2">
          Unlinked route. Share by URL to support.
        </p>
      </div>
    </div>
  );
}
