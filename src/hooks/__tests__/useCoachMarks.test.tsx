/**
 * Tests for `useCoachMarks` — one-shot dismissible coach-mark state
 * with optional per-feature keys, persisted in localStorage.
 *
 * Covers:
 *   1. Unkeyed (legacy) flag — a single global dismissal hides all
 *      unkeyed coach marks.
 *   2. Keyed dismissal — each feature gets its own flag.
 *   3. Initial state reflects what's already in localStorage on mount.
 *   4. Defensive: localStorage unavailable (private mode) doesn't
 *      throw; in-memory dismissal still flips.
 *   5. uid scoping — see the cross-account block at the bottom.
 *
 * The `anon:` prefix on every key below is the signed-out bucket: these
 * render without an AuthProvider, which `useUidForStorageKey` treats the
 * same as signed out. It is deliberately visible in the assertions rather
 * than abstracted away, because the prefix IS the thing under test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCoachMarks } from "../useCoachMarks";
import { AuthUidContext } from "@/lib/auth";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useCoachMarks — unkeyed (legacy)", () => {
  it("starts with showCoachMarks=true on a fresh storage", () => {
    const { result } = renderHook(() => useCoachMarks());
    expect(result.current.showCoachMarks).toBe(true);
  });

  it("flips to showCoachMarks=false after dismiss() and persists", () => {
    const { result } = renderHook(() => useCoachMarks());
    act(() => result.current.dismiss());
    expect(result.current.showCoachMarks).toBe(false);
    expect(
      window.localStorage.getItem("anon:tropos-coach-marks-dismissed"),
    ).toBe("1");
  });

  it("starts dismissed when storage already has the flag", () => {
    window.localStorage.setItem("anon:tropos-coach-marks-dismissed", "1");
    const { result } = renderHook(() => useCoachMarks());
    expect(result.current.showCoachMarks).toBe(false);
  });
});

describe("useCoachMarks — keyed (per-feature)", () => {
  it("uses a key-scoped storage key", () => {
    const { result } = renderHook(() => useCoachMarks("food-eyebrow"));
    act(() => result.current.dismiss());
    expect(
      window.localStorage.getItem(
        "anon:tropos-coach-marks-dismissed:food-eyebrow",
      ),
    ).toBe("1");
  });

  it("dismissing one key does not dismiss another key", () => {
    const a = renderHook(() => useCoachMarks("a"));
    const b = renderHook(() => useCoachMarks("b"));

    act(() => a.result.current.dismiss());
    expect(a.result.current.showCoachMarks).toBe(false);

    /* Remount b after a's dismissal — b's storage is untouched so
       it should still show. */
    const bRemounted = renderHook(() => useCoachMarks("b"));
    expect(bRemounted.result.current.showCoachMarks).toBe(true);
    /* The original b doesn't auto-update when 'a' was dismissed
       (no global event listener) — that's expected for the
       persisted-once pattern. */
    expect(b.result.current.showCoachMarks).toBe(true);
  });

  it("unkeyed and keyed dismissals are independent", () => {
    const unkeyed = renderHook(() => useCoachMarks());
    act(() => unkeyed.result.current.dismiss());

    const keyed = renderHook(() => useCoachMarks("welcome"));
    expect(keyed.result.current.showCoachMarks).toBe(true);
  });
});

describe("useCoachMarks — defensive: localStorage unavailable", () => {
  it("does not throw when setItem fails (private mode)", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const { result } = renderHook(() => useCoachMarks("test"));
    expect(() => act(() => result.current.dismiss())).not.toThrow();
    /* In-memory state still updates even when storage throws — the
       coach mark hides for this session at least. */
    expect(result.current.showCoachMarks).toBe(false);

    setItem.mockRestore();
  });
});

/**
 * Cross-account isolation — the reason the uid prefix exists.
 *
 * localStorage is per-DEVICE. Before this, every coach-mark key was
 * `tropos-coach-marks-dismissed[:name]` with no account segment, so a
 * second person signing in on a shared device inherited the first's
 * dismissals — and a coach mark is by construction a thing you see once,
 * at the start. They simply never got shown the app.
 *
 * CLAUDE.md names this class ("scope any queued or cached writes by uid so
 * they can't leak across an account switch on a shared device"; the
 * offline + share queues were fixed for it in #820) and it names the
 * severity ("across 1000 users, the cold-start state is one of the
 * most-seen states in the app").
 *
 * The uid is supplied through the real context rather than by mocking the
 * hook, so what is pinned is the wiring, not a stub agreeing with itself.
 */
describe("useCoachMarks — one device, two accounts", () => {
  function atUid(uid: string | null, key?: string) {
    return renderHook(() => useCoachMarks(key), {
      wrapper: ({ children }) => (
        <AuthUidContext.Provider value={uid}>
          {children}
        </AuthUidContext.Provider>
      ),
    });
  }

  it("one account's dismissal does not silence another's coach mark", () => {
    const a = atUid("alice", "social-find-invite");
    act(() => a.result.current.dismiss());
    expect(a.result.current.showCoachMarks).toBe(false);

    // Bob signs in on the same device. He has never seen this mark.
    expect(atUid("bob", "social-find-invite").result.current.showCoachMarks).toBe(
      true
    );
    // And Alice's own dismissal survives, so this is isolation rather
    // than the prefix simply breaking persistence.
    expect(
      atUid("alice", "social-find-invite").result.current.showCoachMarks
    ).toBe(false);
  });

  it("re-reads when the uid changes under a MOUNTED component", () => {
    /* `onAuthStateChanged` fires several times per sign-in (CLAUDE.md), so
       the uid moving beneath a live tree is ordinary rather than exotic. A
       once-only useState initializer would keep answering with the
       previous account's verdict — the same leak, one level down. */
    let uid: string | null = "alice";
    const { result, rerender } = renderHook(() => useCoachMarks("welcome"), {
      wrapper: ({ children }) => (
        <AuthUidContext.Provider value={uid}>
          {children}
        </AuthUidContext.Provider>
      ),
    });
    act(() => result.current.dismiss());
    expect(result.current.showCoachMarks).toBe(false);

    uid = "bob";
    rerender();
    expect(result.current.showCoachMarks).toBe(true);
  });

  it("signed out is its own bucket, not a shared one", () => {
    const anon = atUid(null, "welcome");
    act(() => anon.result.current.dismiss());
    expect(atUid("alice", "welcome").result.current.showCoachMarks).toBe(true);
  });
});
