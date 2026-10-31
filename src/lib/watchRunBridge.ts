/**
 * Phone side of the Apple Watch run companion. The phone owns the run, its
 * revision, and the final save; the Watch receives a small display snapshot
 * and sends commands that require an explicit phone acknowledgement.
 *
 * Keep this bridge independent of the run page so Settings can discover a
 * paired Watch and the run can continue normally when the native target is
 * absent. In particular, an event from this bridge never changes a run by
 * itself. The active run must validate its account, session and revision
 * before applying a command and calling acknowledgeWatchRunCommand.
 */
import { App } from "@capacitor/app";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { readString, remove, writeString } from "./localStore";
import { isNativePlatform } from "./platform";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";

export type WatchRunPhase = "running" | "paused" | "review";
export type WatchRunAction = "pause" | "resume" | "end";

export interface WatchRunStatus {
  available: boolean;
  paired: boolean;
  installed: boolean;
  reachable: boolean;
  enabled: boolean;
  activeSessionId?: string;
}

/** Metrics are derived on the phone. No route, profile, or account ID crosses
 * the Watch transport. Revisions change on run-state transitions, not ticks. */
export interface WatchRunSnapshot {
  sessionId: string;
  revision: number;
  phase: WatchRunPhase;
  elapsedSeconds: number;
  distanceMeters: number;
  paceSecondsPerKm?: number | null;
  recordedAtMs: number;
  /** Set only after the iPhone summary has accepted a durable local save.
   * `synced` requires server confirmation of that exact canonical run. */
  saveStatus?: "queued" | "synced";
}

export interface WatchRunCommand {
  sessionId: string;
  commandId: string;
  expectedRevision: number;
  action: WatchRunAction;
  /** Set by the iPhone bridge when it receives the Watch command. */
  createdAtMs: number;
  /** Native receives no acknowledgement after this instant. Never apply a
   * replayed command that would be invisible to the athlete. */
  expiresAtMs: number;
}

export interface WatchRunCommandAck {
  sessionId: string;
  commandId: string;
  revision: number;
  phase: WatchRunPhase;
  accepted: boolean;
  reason?: WatchRunCommandRejection;
}

export interface WatchHeartRateSample {
  sessionId: string;
  sampleId: string;
  timestampMs: number;
  bpm: number;
}

export type WatchRunCommandRejection =
  | "account-changed"
  | "stale-session"
  | "stale-revision"
  | "expired-command"
  | "invalid-transition"
  | "command-failed";

export interface WatchRunCommandContext {
  uid: string;
  sessionId: string;
  revision: number;
  phase: WatchRunPhase;
}

interface WatchRunPlugin {
  getStatus(): Promise<WatchRunStatus>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  publishSnapshot(snapshot: WatchRunSnapshot): Promise<void>;
  acknowledgeCommand(ack: WatchRunCommandAck): Promise<void>;
  getPendingCommands(): Promise<{ commands: WatchRunCommand[] }>;
  getPendingHeartRates(): Promise<{ samples: WatchHeartRateSample[] }>;
  clearSession(options: { sessionId?: string }): Promise<void>;
  addListener(
    eventName: "watchCommand" | "heartRateSample" | "connectionChanged",
    listener: (
      event: WatchRunCommand | WatchHeartRateSample | WatchRunStatus
    ) => void
  ): Promise<PluginListenerHandle>;
}

let plugin: WatchRunPlugin | null = null;
function nativePlugin(): WatchRunPlugin | null {
  if (!isNativePlatform()) return null;
  if (!plugin) plugin = registerPlugin<WatchRunPlugin>("WatchRun");
  return plugin;
}

function releasedPlugin(): WatchRunPlugin | null {
  return CONNECTED_TRAINING_RELEASED ? nativePlugin() : null;
}

const UNAVAILABLE_STATUS: WatchRunStatus = {
  available: false,
  paired: false,
  installed: false,
  reachable: false,
  enabled: false,
};

const BOUND_ACCOUNT_KEY = "tropos.watch_run.bound_uid";
let accountTransition: Promise<void> = Promise.resolve();

export async function getWatchRunStatus(): Promise<WatchRunStatus> {
  const native = releasedPlugin();
  if (!native) return { ...UNAVAILABLE_STATUS };
  try {
    return await native.getStatus();
  } catch {
    // An older native shell can lack the WatchRun plugin. Availability must
    // remain truthful, and running on the phone must not be affected.
    return { ...UNAVAILABLE_STATUS };
  }
}

/** Returns false when an older native shell or web cannot honor the choice. */
export async function setWatchRunEnabled(enabled: boolean): Promise<boolean> {
  // Turning the feature off must still reach native storage if an older
  // build left a Watch enabled. Turning it on requires the release gate.
  const native = enabled ? releasedPlugin() : nativePlugin();
  if (!native) return false;
  try {
    await native.setEnabled({ enabled });
    return true;
  } catch {
    return false;
  }
}

/** Best effort: a Watch transport failure must never stop the phone run. */
export async function publishWatchRunSnapshot(
  snapshot: WatchRunSnapshot
): Promise<boolean> {
  const native = releasedPlugin();
  if (!native) return false;
  try {
    await native.publishSnapshot(snapshot);
    return true;
  } catch {
    return false;
  }
}

export function publishWatchRunSaveStatus(
  snapshot: Omit<WatchRunSnapshot, "phase" | "saveStatus"> & {
    saveStatus: "queued" | "synced";
  }
): Promise<boolean> {
  return publishWatchRunSnapshot({ ...snapshot, phase: "review" });
}

/** The returned boolean says whether the acknowledgement reached the native
 * bridge, not whether the command was accepted. The caller sets `accepted`. */
export async function acknowledgeWatchRunCommand(
  ack: WatchRunCommandAck
): Promise<boolean> {
  const native = releasedPlugin();
  if (!native) return false;
  try {
    await native.acknowledgeCommand(ack);
    return true;
  } catch {
    return false;
  }
}

/** Native storage keeps a bounded, protected beat buffer while the web view
 * is suspended. The run summary can recover it after a process restart. */
export async function getPendingWatchHeartRateSamples(): Promise<
  WatchHeartRateSample[]
> {
  const native = releasedPlugin();
  if (!native) return [];
  try {
    const response = await native.getPendingHeartRates();
    return response.samples.filter(isWatchHeartRateSample);
  } catch {
    return [];
  }
}

/** Omit the ID on sign-out to clear any old account's session and samples. */
export async function clearWatchRunSession(sessionId?: string): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.clearSession(sessionId ? { sessionId } : {});
  } catch {
    // The phone remains authoritative even if the Watch is unavailable.
  }
}

function isUnimplementedPlugin(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "UNIMPLEMENTED"
  );
}

/** Account transitions must know that native data was cleared before the
 * next account is shown. An older shell without this plugin has no WatchRun
 * data; any other native failure keeps the account transition closed. */
export async function clearWatchRunAccountState(): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.clearSession({});
  } catch (error) {
    if (!isUnimplementedPlugin(error)) throw error;
  }
}

/** Called by AuthProvider before exposing a different account. The bound UID
 * is local to this iPhone; it is never sent to the Watch. A same-account app
 * relaunch keeps its explicit Watch preference, while sign-out or switching
 * accounts clears native session, pending controls and heart rate. */
export function syncWatchRunAccount(uid: string | null): Promise<void> {
  // Firebase does not await auth callbacks. Serialise A→B→C transitions so
  // an older native clear cannot finish after and overwrite the new owner.
  const next = accountTransition.then(async () => {
    if (!CONNECTED_TRAINING_RELEASED) {
      await clearWatchRunAccountState();
      remove(BOUND_ACCOUNT_KEY);
      return;
    }
    const previousUid = readString(BOUND_ACCOUNT_KEY);
    if (uid && previousUid === uid) return;
    await clearWatchRunAccountState();
    if (uid) writeString(BOUND_ACCOUNT_KEY, uid);
    else remove(BOUND_ACCOUNT_KEY);
  });
  accountTransition = next.catch(() => {});
  return next;
}

async function subscribe<Event>(
  eventName: "watchCommand" | "heartRateSample" | "connectionChanged",
  handler: (event: Event) => void
): Promise<() => void> {
  const native = releasedPlugin();
  if (!native) return () => {};
  try {
    const listener = await native.addListener(eventName, handler as never);
    return () => {
      void listener.remove();
    };
  } catch {
    return () => {};
  }
}

function isWatchRunCommand(value: unknown): value is WatchRunCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<WatchRunCommand>;
  return (
    typeof command.sessionId === "string" &&
    command.sessionId.length > 0 &&
    typeof command.commandId === "string" &&
    command.commandId.length > 0 &&
    Number.isSafeInteger(command.expectedRevision) &&
    typeof command.createdAtMs === "number" &&
    Number.isFinite(command.createdAtMs) &&
    typeof command.expiresAtMs === "number" &&
    Number.isFinite(command.expiresAtMs) &&
    command.expiresAtMs > command.createdAtMs &&
    (command.action === "pause" ||
      command.action === "resume" ||
      command.action === "end")
  );
}

/** The native half retains unacknowledged commands through process death.
 * Re-read it after the listener is installed and every time iOS foregrounds
 * the web view. Event and backlog delivery can race, so each subscription
 * avoids concurrent delivery of one command; an unacknowledged command is
 * eligible again on foreground or remount. The run still validates the active
 * account/session/revision before acting on anything delivered here. */
export async function subscribeWatchRunCommands(
  handler: (command: WatchRunCommand) => void
): Promise<() => void> {
  const native = releasedPlugin();
  if (!native) return () => {};
  const inFlight = new Set<string>();
  let disposed = false;
  const deliver = (value: unknown) => {
    if (disposed || !isWatchRunCommand(value)) return;
    const key = `${value.sessionId}:${value.commandId}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    // Native storage retains the command until acknowledgement. If that
    // acknowledgement fails, the next foreground replay can try again.
    void Promise.resolve()
      .then(() => handler(value))
      .catch(() => {})
      .finally(() => inFlight.delete(key));
  };
  const replay = async () => {
    try {
      const response = await native.getPendingCommands();
      response.commands.forEach(deliver);
    } catch {
      // An older shell may have the event but not the pending-command API.
    }
  };
  try {
    const nativeListener = await native.addListener("watchCommand", deliver);
    let appListener: PluginListenerHandle | null = null;
    try {
      appListener = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void replay();
      });
    } catch {
      // The initial replay and native event still work without this hook.
    }
    await replay();
    return () => {
      disposed = true;
      void nativeListener.remove();
      void appListener?.remove();
    };
  } catch {
    return () => {};
  }
}

export function subscribeWatchHeartRateSamples(
  handler: (sample: WatchHeartRateSample) => void
): Promise<() => void> {
  const native = releasedPlugin();
  if (!native) return Promise.resolve(() => {});
  const delivered = new Set<string>();
  let disposed = false;
  const deliver = (value: unknown) => {
    if (disposed || !isWatchHeartRateSample(value)) return;
    if (delivered.has(value.sampleId)) return;
    delivered.add(value.sampleId);
    handler(value);
  };
  const replay = async () => {
    try {
      const response = await native.getPendingHeartRates();
      response.samples.forEach(deliver);
    } catch {
      // Older native shells can still emit live samples without this API.
    }
  };
  return (async () => {
    try {
      const nativeListener = await native.addListener(
        "heartRateSample",
        deliver
      );
      let appListener: PluginListenerHandle | null = null;
      try {
        appListener = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (isActive) void replay();
          }
        );
      } catch {
        // Initial replay and live delivery remain available.
      }
      await replay();
      return () => {
        disposed = true;
        void nativeListener.remove();
        void appListener?.remove();
      };
    } catch {
      return () => {};
    }
  })();
}

function isWatchHeartRateSample(value: unknown): value is WatchHeartRateSample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Partial<WatchHeartRateSample>;
  return (
    typeof sample.sessionId === "string" &&
    sample.sessionId.length > 0 &&
    typeof sample.sampleId === "string" &&
    sample.sampleId.length > 0 &&
    typeof sample.timestampMs === "number" &&
    Number.isFinite(sample.timestampMs) &&
    typeof sample.bpm === "number" &&
    Number.isFinite(sample.bpm) &&
    sample.bpm > 0 &&
    sample.bpm < 300
  );
}

export function subscribeWatchRunConnection(
  handler: (status: WatchRunStatus) => void
): Promise<() => void> {
  return subscribe("connectionChanged", handler);
}

/** A command is safe to apply only to the currently signed-in account and
 * active session at precisely the revision the Watch observed. The caller
 * must increment the revision after a successful state change, then ack. */
export function validateWatchRunCommand(
  command: WatchRunCommand,
  context: WatchRunCommandContext | null,
  currentUid: string | null,
  nowMs = Date.now()
): WatchRunCommandRejection | null {
  if (!context || !currentUid || context.uid !== currentUid)
    return "account-changed";
  if (command.sessionId !== context.sessionId) return "stale-session";
  if (nowMs >= command.expiresAtMs) return "expired-command";
  if (command.expectedRevision !== context.revision) return "stale-revision";
  if (
    (command.action === "pause" && context.phase !== "running") ||
    (command.action === "resume" && context.phase !== "paused") ||
    (command.action === "end" && context.phase === "review")
  )
    return "invalid-transition";
  return null;
}

/** Bounded acknowledgement cache for duplicate deliveries, including an
 * acknowledgement retried after the Watch reconnects. A new run creates a
 * fresh ledger; never reuse it across accounts. */
export class WatchRunCommandLedger {
  private readonly acknowledgements = new Map<string, WatchRunCommandAck>();
  private readonly capacity: number;
  constructor(capacity = 128) {
    this.capacity = capacity;
  }

  get(command: WatchRunCommand): WatchRunCommandAck | undefined {
    return this.acknowledgements.get(
      `${command.sessionId}:${command.commandId}`
    );
  }

  remember(ack: WatchRunCommandAck): void {
    const key = `${ack.sessionId}:${ack.commandId}`;
    this.acknowledgements.delete(key);
    this.acknowledgements.set(key, ack);
    if (this.acknowledgements.size > this.capacity) {
      const oldest = this.acknowledgements.keys().next().value;
      if (oldest) this.acknowledgements.delete(oldest);
    }
  }

  clear(): void {
    this.acknowledgements.clear();
  }
}
