/**
 * `useDismissOnce` — the shared dismiss-once primitive, and its uid scoping.
 *
 * The hook had no test file at all, which is part of why the bug below
 * survived: nothing exercised the storage key, so nothing could notice that
 * it had no account segment in it.
 *
 * localStorage is per-DEVICE. Scoping was left to whoever built the key, and
 * of the nine call sites six didn't do it — so on a shared device the second
 * account inherited the first's dismissals:
 *
 *   - the Home welcome checklist, on a literal constant key, so account two
 *     never saw the onboarding checklist at all
 *   - the deload and recovery-reduction banners, keyed by week — two people
 *     training on one device in the same week, and only the first is told
 *     their programme cut load
 *   - the contextual tip banner, keyed by tip
 *   - the challenge finale card, keyed by CHALLENGE id, which is global by
 *     construction and so collides by design
 *
 * CLAUDE.md names the class ("scope any queued or cached writes by uid so
 * they can't leak across an account switch on a shared device" — the offline
 * and share queues were fixed for it in #820).
 *
 * The uid comes through the REAL context rather than a mocked hook: what
 * needs pinning is the wiring from context to storage key, and a stub would
 * only agree with itself.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissOnce } from "../useDismissOnce";
import { AuthUidContext } from "@/lib/auth";

beforeEach(() => {
  window.localStorage.clear();
});

function atUid(uid: string | null, key: string) {
  return renderHook(() => useDismissOnce(key), {
    wrapper: ({ children }) => (
      <AuthUidContext.Provider value={uid}>{children}</AuthUidContext.Provider>
    ),
  });
}

describe("useDismissOnce — basics", () => {
  it("starts undismissed and persists a dismissal", () => {
    const { result } = atUid("alice", "tip:race-progress");
    expect(result.current.dismissed).toBe(false);

    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
    expect(window.localStorage.getItem("alice:tip:race-progress")).toBe("1");
  });

  it("starts dismissed when storage already says so", () => {
    window.localStorage.setItem("alice:tip:race-progress", "1");
    expect(atUid("alice", "tip:race-progress").result.current.dismissed).toBe(
      true
    );
  });

  it("keeps separate surfaces separate", () => {
    const a = atUid("alice", "banner-a");
    act(() => a.result.current.dismiss());
    expect(atUid("alice", "banner-b").result.current.dismissed).toBe(false);
  });

  it("does not throw when storage is unavailable (private mode)", () => {
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const { result } = atUid("alice", "banner");
    expect(() => act(() => result.current.dismiss())).not.toThrow();
    // In-memory state still flips, so the banner hides for this session.
    expect(result.current.dismissed).toBe(true);
    setItem.mockRestore();
  });
});

describe("useDismissOnce — one device, two accounts", () => {
  it("one account's dismissal does not hide another's banner", () => {
    // The deload banner's real key shape: prefix + the training week.
    const KEY = "tropos-pgm-deload-dismissed:2026-W21";
    const alice = atUid("alice", KEY);
    act(() => alice.result.current.dismiss());
    expect(alice.result.current.dismissed).toBe(true);

    // Bob trains on the same device in the same week. His programme cut
    // load too, and he has not been told.
    expect(atUid("bob", KEY).result.current.dismissed).toBe(false);
    // Alice's dismissal survives — isolation, not broken persistence.
    expect(atUid("alice", KEY).result.current.dismissed).toBe(true);
  });

  it("isolates a key that is global by construction", () => {
    // Challenge ids are shared across all users, so the finale card's key
    // is the same string for everyone — this one collided by design.
    const KEY = "challenge-finale-global-monthly-2026-08-01";
    const alice = atUid("alice", KEY);
    act(() => alice.result.current.dismiss());
    expect(atUid("bob", KEY).result.current.dismissed).toBe(false);
  });

  it("isolates a constant key", () => {
    // The Home welcome checklist had no variable part at all.
    const KEY = "tropos-welcome-checklist-dismissed";
    const alice = atUid("alice", KEY);
    act(() => alice.result.current.dismiss());
    expect(atUid("bob", KEY).result.current.dismissed).toBe(false);
  });

  it("re-reads when the uid changes under a MOUNTED component", () => {
    /* `onAuthStateChanged` fires several times per sign-in (CLAUDE.md), so
       the uid moving beneath a live tree is ordinary. A once-only useState
       initializer would keep answering with the previous account's verdict
       — the same leak, one level down, and invisible to every test above
       because they all remount. */
    let uid: string | null = "alice";
    const { result, rerender } = renderHook(
      () => useDismissOnce("tropos-welcome-checklist-dismissed"),
      {
        wrapper: ({ children }) => (
          <AuthUidContext.Provider value={uid}>
            {children}
          </AuthUidContext.Provider>
        ),
      }
    );
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);

    uid = "bob";
    rerender();
    expect(result.current.dismissed).toBe(false);

    // And back: Alice's dismissal is still hers.
    uid = "alice";
    rerender();
    expect(result.current.dismissed).toBe(true);
  });

  it("signed out is its own bucket, not a shared one", () => {
    const KEY = "tropos-welcome-checklist-dismissed";
    const anon = atUid(null, KEY);
    act(() => anon.result.current.dismiss());
    expect(atUid("alice", KEY).result.current.dismissed).toBe(false);
  });
});
