/**
 * useHiddenActivities — the account's hidden posts (App1 Q38), on the one
 * Firestore fake (ADR-0009).
 *
 * Pins: the list is read from `users/{uid}/hiddenPosts`, per account;
 * `hide` and `unhide` write and delete there and the listener shows the
 * change; `unhide` says when it was refused; and a device's pre-App1
 * local list is carried into the account once, then forgotten.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  flushSnapshots,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";

const AUTH = vi.hoisted(() => ({ uid: "u-1" as string | null }));
vi.mock("@/lib/auth", () => ({ useUid: () => AUTH.uid }));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const captureError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/errorReporting", () => ({ captureError }));

import { useHiddenActivities } from "../useHiddenActivities";

const at = (iso: string) => Timestamp.fromMillis(Date.parse(iso));

beforeEach(() => {
  resetFirestore();
  window.localStorage.clear();
  captureError.mockClear();
  AUTH.uid = "u-1";
});

describe("useHiddenActivities — reading the account's list", () => {
  it("reads the hidden posts, newest hidden first, with each author", async () => {
    seedFirestore({
      "users/u-1/hiddenPosts/act-old": {
        hiddenAt: at("2026-10-01T09:00:00Z"),
        authorId: "maya",
      },
      "users/u-1/hiddenPosts/act-new": {
        hiddenAt: at("2026-11-01T09:00:00Z"),
      },
    });
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect([...result.current.hidden].sort()).toEqual(["act-new", "act-old"]);
    expect(result.current.posts.map((p) => p.activityId)).toEqual([
      "act-new",
      "act-old",
    ]);
    expect(result.current.posts[1].authorId).toBe("maya");
    expect(result.current.posts[0].authorId).toBeUndefined();
  });

  it("reads only the signed-in account's list", async () => {
    seedFirestore({
      "users/u-1/hiddenPosts/act-A": { hiddenAt: at("2026-11-01T09:00:00Z") },
      "users/u-2/hiddenPosts/act-B": { hiddenAt: at("2026-11-01T09:00:00Z") },
    });
    AUTH.uid = "u-2";
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect([...result.current.hidden]).toEqual(["act-B"]);
  });

  it("keeps one Set while the ids are unchanged, so the feed is not refiltered", async () => {
    seedFirestore({
      "users/u-1/hiddenPosts/act-A": { hiddenAt: at("2026-11-01T09:00:00Z") },
      "users/u-1/hiddenPosts/act-B": { hiddenAt: at("2026-11-02T09:00:00Z") },
    });
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.hidden.size).toBe(2));
    const first = result.current.hidden;
    // A snapshot arrives with the same ids (one record written again).
    act(() => {
      result.current.hide("act-A", "maya");
    });
    await waitFor(() =>
      expect(result.current.posts[0]).toMatchObject({
        activityId: "act-A",
        authorId: "maya",
      })
    );
    expect(result.current.hidden).toBe(first);
    // A new id is a new Set.
    act(() => {
      result.current.hide("act-C");
    });
    await waitFor(() => expect(result.current.hidden.size).toBe(3));
    expect(result.current.hidden).not.toBe(first);
  });
});

describe("useHiddenActivities — hide and unhide", () => {
  it("hide writes the post and its author to the account, and the list shows it", async () => {
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.hide("act-1", "maya");
    });
    await waitFor(() => expect(result.current.hidden.has("act-1")).toBe(true));
    const stored = readDoc("users/u-1/hiddenPosts/act-1");
    expect(stored?.authorId).toBe("maya");
    expect(stored?.hiddenAt).toBeInstanceOf(Timestamp);
    expect(Object.keys(stored ?? {}).sort()).toEqual(["authorId", "hiddenAt"]);
  });

  it("hide without an author stores no author field", async () => {
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.hide("act-1");
    });
    await waitFor(() => expect(result.current.hidden.has("act-1")).toBe(true));
    expect(Object.keys(readDoc("users/u-1/hiddenPosts/act-1") ?? {})).toEqual([
      "hiddenAt",
    ]);
  });

  it("unhide deletes the record and the post leaves the list", async () => {
    seedFirestore({
      "users/u-1/hiddenPosts/act-1": { hiddenAt: at("2026-11-01T09:00:00Z") },
      "users/u-1/hiddenPosts/act-2": { hiddenAt: at("2026-11-02T09:00:00Z") },
    });
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.hidden.size).toBe(2));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.unhide("act-1");
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.hidden.has("act-1")).toBe(false));
    expect(result.current.hidden.has("act-2")).toBe(true);
    expect(readDoc("users/u-1/hiddenPosts/act-1")).toBeUndefined();
  });

  it("unhide resolves false, and keeps the post hidden, when the delete is refused", async () => {
    seedFirestore({
      "users/u-1/hiddenPosts/act-1": { hiddenAt: at("2026-11-01T09:00:00Z") },
    });
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.hidden.has("act-1")).toBe(true));
    failNextFirestore("deleteDoc", {
      path: "users/u-1/hiddenPosts/act-1",
      code: "permission-denied",
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.unhide("act-1");
    });
    expect(unfiredFailures()).toEqual([]);
    expect(ok).toBe(false);
    await flushSnapshots();
    expect(result.current.hidden.has("act-1")).toBe(true);
    expect(readDoc("users/u-1/hiddenPosts/act-1")).toBeDefined();
    expect(captureError).toHaveBeenCalled();
  });

  it("writes nothing when nobody is signed in", async () => {
    AUTH.uid = null;
    const { result } = renderHook(() => useHiddenActivities());
    act(() => {
      result.current.hide("act-1", "maya");
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.unhide("act-1");
    });
    expect(ok).toBe(false);
    expect(result.current.hidden.size).toBe(0);
    expect(writeLog()).toEqual([]);
  });
});

describe("useHiddenActivities — the device's list from before App1", () => {
  it("carries the device's hidden posts into the account, then forgets them", async () => {
    AUTH.uid = "u-mig";
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-mig",
      JSON.stringify(["act-A", "act-B"])
    );
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.hidden.size).toBe(2));
    expect(readDoc("users/u-mig/hiddenPosts/act-A")).toBeDefined();
    expect(readDoc("users/u-mig/hiddenPosts/act-B")).toBeDefined();
    await waitFor(() =>
      expect(
        window.localStorage.getItem("tropos.hiddenActivities.u-mig")
      ).toBeNull()
    );
  });

  it("keeps the device's list when a write is refused, to carry it next time", async () => {
    AUTH.uid = "u-mig-fail";
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-mig-fail",
      JSON.stringify(["act-A"])
    );
    failNextFirestore("setDoc", {
      path: "users/u-mig-fail/hiddenPosts/act-A",
      code: "unavailable",
    });
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(captureError).toHaveBeenCalled());
    expect(unfiredFailures()).toEqual([]);
    expect(
      window.localStorage.getItem("tropos.hiddenActivities.u-mig-fail")
    ).not.toBeNull();
  });

  it("leaves another account's device list alone", async () => {
    window.localStorage.setItem(
      "tropos.hiddenActivities.someone-else",
      JSON.stringify(["act-Z"])
    );
    AUTH.uid = "u-own";
    const { result } = renderHook(() => useHiddenActivities());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.hidden.size).toBe(0);
    expect(
      window.localStorage.getItem("tropos.hiddenActivities.someone-else")
    ).not.toBeNull();
  });
});
