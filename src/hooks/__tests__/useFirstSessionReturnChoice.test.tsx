// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

let currentUid: string | null = "u1";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return currentUid ? { uid: currentUid } : null;
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => currentUid,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { useFirstSessionReturnChoice } from "@/hooks/useFirstSessionReturnChoice";
import {
  deferReads,
  failNextFirestore,
  pendingReads,
  readDoc,
  releaseRead,
  resetFirestore,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";

const U1 = "users/u1/settings/firstSessionReturn";
const U2 = "users/u2/settings/firstSessionReturn";

beforeEach(() => {
  resetFirestore();
  currentUid = "u1";
});

describe("first-session return choice", () => {
  it("confirms and stores one account-scoped answer", async () => {
    const { result } = renderHook(() => useFirstSessionReturnChoice());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.response).toBeNull();
    await act(async () => {
      expect(await result.current.record("later")).toBe(true);
    });
    expect(result.current.response).toBe("later");
    expect(readDoc(U1)?.response).toBe("later");
    expect(writeLog()).toEqual([
      expect.objectContaining({ op: "set:merge", path: U1 }),
    ]);
  });

  it("reads an answer made on another device", async () => {
    seedFirestore({ [U1]: { response: "accepted" } });
    const { result } = renderHook(() => useFirstSessionReturnChoice());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.response).toBe("accepted");
  });

  it("never renders a late prior-account read under the next account", async () => {
    seedFirestore({
      [U1]: { response: "accepted" },
      [U2]: { response: "denied" },
    });
    deferReads();
    const { result, rerender } = renderHook(() =>
      useFirstSessionReturnChoice()
    );
    await waitFor(() => expect(pendingReads()).toEqual([U1]));
    currentUid = "u2";
    rerender();
    await waitFor(() => expect(pendingReads()).toEqual([U1, U2]));
    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    await waitFor(() => expect(result.current.response).toBe("denied"));
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    expect(result.current.response).toBe("denied");
  });

  it("hides the offer on read failure and refuses a speculative answer", async () => {
    failNextFirestore("getDoc", { path: U1, code: "unavailable" });
    const { result } = renderHook(() => useFirstSessionReturnChoice());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(await result.current.record("later")).toBe(false);
    expect(writeLog()).toHaveLength(0);
  });
});
