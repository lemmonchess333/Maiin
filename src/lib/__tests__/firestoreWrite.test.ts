import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the firebase/firestore write primitives so we can inspect the
// exact payload the guarded wrappers forward after stripping undefined.
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: "generated-id" })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

import { addDoc, setDoc, updateDoc } from "firebase/firestore";
import { addDocGuarded, setDocGuarded, updateDocGuarded } from "../firestoreWrite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ref: any = { __ref: true };

describe("firestoreWrite guarded wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addDocGuarded strips undefined and returns the doc ref", async () => {
    const result = await addDocGuarded(ref, {
      name: "x",
      missing: undefined,
      kept: null,
    } as never);
    expect(result).toEqual({ id: "generated-id" });
    const [, payload] = vi.mocked(addDoc).mock.calls[0];
    expect(payload).toEqual({ name: "x", kept: null });
    expect("missing" in (payload as object)).toBe(false);
  });

  it("setDocGuarded strips undefined recursively (nested objects + arrays)", async () => {
    await setDocGuarded(ref, {
      a: { b: undefined, c: 1 },
      list: [1, undefined, 3],
    } as never);
    const [, payload] = vi.mocked(setDoc).mock.calls[0];
    // nested undefined dropped, array undefined → null to preserve length
    expect(payload).toEqual({ a: { c: 1 }, list: [1, null, 3] });
  });

  it("setDocGuarded forwards merge options unchanged", async () => {
    await setDocGuarded(ref, { x: 1, y: undefined } as never, { merge: true });
    const call = vi.mocked(setDoc).mock.calls[0];
    expect(call[1]).toEqual({ x: 1 });
    expect(call[2]).toEqual({ merge: true });
  });

  it("setDocGuarded omits the options arg when not given", async () => {
    await setDocGuarded(ref, { x: 1 } as never);
    expect(vi.mocked(setDoc).mock.calls[0].length).toBe(2);
  });

  it("updateDocGuarded strips undefined", async () => {
    await updateDocGuarded(ref, { retired: true, note: undefined } as never);
    const [, payload] = vi.mocked(updateDoc).mock.calls[0];
    expect(payload).toEqual({ retired: true });
  });

  it("passes FieldValue-like class instances through untouched", async () => {
    // stripUndefined only walks plain objects; class instances (Timestamp,
    // increment(), serverTimestamp(), …) must survive unchanged.
    class FakeFieldValue {
      op = "increment";
    }
    const sentinel = new FakeFieldValue();
    await updateDocGuarded(ref, { count: sentinel, gone: undefined } as never);
    const call = vi.mocked(updateDoc).mock.calls[0] as unknown as unknown[];
    const payload = call[1] as Record<string, unknown>;
    expect(payload.count).toBe(sentinel);
    expect("gone" in payload).toBe(false);
  });
});
