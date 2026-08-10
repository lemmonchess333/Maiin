/**
 * In-memory notification scheduler — the same argument as the Firestore
 * fake (ADR-0009), applied to `@/lib/notifications`.
 *
 * A `vi.fn()` stub can answer "was cancelNotification called with 1002?".
 * It cannot answer "is there a lunch reminder scheduled right now?", and
 * that second question is the one reminder bugs live in. The reminder
 * hooks reschedule by CANCELLING all three ids and then re-scheduling the
 * enabled ones, so every interesting failure is about the resulting SET:
 *
 *   - a disabled meal that leaves residue (cancelled, then re-scheduled
 *     by a stale branch) — call-count assertions pass, the user still
 *     gets pinged.
 *   - an edited time that schedules the new occurrence WITHOUT cancelling
 *     the old, so the user gets two.
 *   - `repeats` dropped, which the payload's own comment records as
 *     having silently stopped every reminder after its first delivery.
 *
 * Modelling the schedule as state makes each of those a direct assertion
 * instead of an inference from a call log.
 *
 * Permission is modelled too, because "denied" is not an error path — it
 * makes `scheduleNotification` return false while the hook carries on, so
 * a hook that ignores the result looks identical to one that handles it
 * unless you can see that nothing landed.
 */
import type {
  NotificationPayload,
  NotificationPermissionState,
  PendingNotification,
} from "@/lib/notifications";

export class NotificationsFake {
  /** id → the payload as scheduled. Last write wins, like the OS. */
  private schedule = new Map<number, NotificationPayload>();
  private permission: NotificationPermissionState = "granted";
  /** Ids whose next schedule attempt should fail (one shot each). */
  private failIds = new Set<number>();
  private failAll = false;
  /** When set, every schedule attempt parks here until released. */
  private scheduleGate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;

  reset(): void {
    this.schedule.clear();
    this.permission = "granted";
    this.failIds.clear();
    this.failAll = false;
    // Release any parked schedule so a test that forgets to can't hang
    // the NEXT one on a promise nobody holds a handle to.
    this.openGate?.();
    this.scheduleGate = null;
    this.openGate = null;
  }

  // ── the surface the hooks call ───────────────────────────────────

  async requestPermission(): Promise<boolean> {
    return this.permission === "granted";
  }

  async hasPermission(): Promise<boolean> {
    return this.permission === "granted";
  }

  async permissionState(): Promise<NotificationPermissionState> {
    return this.permission;
  }

  async schedule_(payload: NotificationPayload): Promise<boolean> {
    // Park BEFORE any state change, so a deferred pass is suspended
    // exactly where a real in-flight OS call would be.
    if (this.scheduleGate) await this.scheduleGate;
    // Denied permission is a soft failure in the real module too: it
    // returns false rather than throwing, and nothing is scheduled.
    if (this.permission !== "granted") return false;
    if (this.failAll || this.failIds.has(payload.id)) {
      this.failIds.delete(payload.id);
      return false;
    }
    this.schedule.set(payload.id, { ...payload });
    return true;
  }

  async cancel(id: number): Promise<void> {
    this.schedule.delete(id);
  }

  async cancelAll(): Promise<void> {
    this.schedule.clear();
  }

  async pending(): Promise<PendingNotification[]> {
    return [...this.schedule.values()].map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      scheduleAt: p.scheduleAt ? p.scheduleAt.toISOString() : null,
    }));
  }

  // ── inspection, for tests ────────────────────────────────────────

  /** Every scheduled payload, ordered by id so assertions are stable. */
  all(): NotificationPayload[] {
    return [...this.schedule.values()].sort((a, b) => a.id - b.id);
  }

  /** The payload scheduled under `id`, or undefined if nothing is. */
  at(id: number): NotificationPayload | undefined {
    return this.schedule.get(id);
  }

  ids(): number[] {
    return this.all().map((p) => p.id);
  }

  setPermission(state: NotificationPermissionState): void {
    this.permission = state;
  }

  /**
   * Hold every subsequent schedule attempt mid-flight, the shape
   * `firestoreFake.deferReads()` takes for reads.
   *
   * This is what makes a stale-pass test honest. Without it the only way
   * to ask "does an unmounted hook still schedule?" is to unmount and
   * then assert the schedule is empty — which is satisfied at t=0 by the
   * initial state and proves nothing (the negative-assertion trap in
   * CLAUDE.md). Parking the pass INSIDE its loop, unmounting, and only
   * then releasing puts the write after the unmount, where it either
   * lands or doesn't.
   */
  deferSchedules(): void {
    this.scheduleGate = new Promise((resolve) => {
      this.openGate = resolve;
    });
  }

  /** Let the parked schedule attempts proceed. */
  releaseSchedules(): void {
    this.openGate?.();
    this.scheduleGate = null;
    this.openGate = null;
  }

  /** Make the next schedule attempt fail — for a single id, or all. */
  failNextSchedule(id?: number): void {
    if (id === undefined) this.failAll = true;
    else this.failIds.add(id);
  }
}

export const notificationsFake = new NotificationsFake();
