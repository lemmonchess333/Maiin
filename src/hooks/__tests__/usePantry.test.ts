import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockUser = { uid: "me" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

const snapshotListeners: Array<
  (snap: {
    docs: Array<{ id: string; data: () => Record<string, unknown> }>;
  }) => void
> = [];
const addDocCalls: Array<Record<string, unknown>> = [];
const setDocCalls: Array<{ id: string; data: Record<string, unknown> }> = [];
const deleteDocCalls: Array<string> = [];
const transactionCalls: Array<{
  ref: { id: string };
  read: Record<string, unknown> | null;
  update: Record<string, unknown> | null;
}> = [];
let mockDocState: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(async (_ref: unknown, data: Record<string, unknown>) => {
    addDocCalls.push(data);
    return { id: `pantry-${addDocCalls.length}` };
  }),
  collection: vi.fn(),
  deleteDoc: vi.fn(async (ref: { id: string }) => {
    deleteDocCalls.push(ref.id);
  }),
  doc: vi.fn((_db: unknown, ..._segments: string[]) => ({
    id: _segments[_segments.length - 1] ?? "",
  })),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: {
        docs: Array<{ id: string; data: () => Record<string, unknown> }>;
      }) => void,
    ) => {
      snapshotListeners.push(onNext);
      return () => {};
    },
  ),
  orderBy: vi.fn(),
  query: vi.fn((c: unknown) => c),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: {
        get: (ref: { id: string }) => Promise<{
          exists: () => boolean;
          data: () => Record<string, unknown>;
        }>;
        update: (ref: { id: string }, update: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      const call: (typeof transactionCalls)[number] = {
        ref: { id: "" },
        read: null,
        update: null,
      };
      await fn({
        get: async (ref) => {
          call.ref = ref;
          const data = mockDocState[ref.id];
          call.read = data ?? null;
          return {
            exists: () => data !== undefined,
            data: () => data ?? {},
          };
        },
        update: (ref, update) => {
          call.ref = ref;
          call.update = update;
        },
      });
      transactionCalls.push(call);
    },
  ),
  serverTimestamp: vi.fn(() => "__SERVER_TIMESTAMP__"),
  setDoc: vi.fn(
    async (
      ref: { id: string },
      data: Record<string, unknown>,
      _opts?: unknown,
    ) => {
      setDocCalls.push({ id: ref.id, data });
    },
  ),
}));

import { usePantry } from "../usePantry";

function pumpSnapshot(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
) {
  snapshotListeners.forEach((l) =>
    l({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
  );
}

describe("usePantry", () => {
  beforeEach(() => {
    snapshotListeners.length = 0;
    addDocCalls.length = 0;
    setDocCalls.length = 0;
    deleteDocCalls.length = 0;
    transactionCalls.length = 0;
    mockDocState = {};
  });

  describe("parsePantryDoc lazy defaults", () => {
    it("defaults missing fields to safe values", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([
          {
            id: "minimal",
            data: { name: "Eggs" },
          },
        ]);
      });
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      const item = result.current.items[0];
      expect(item.name).toBe("Eggs");
      expect(item.calories).toBe(0);
      expect(item.protein).toBe(0);
      expect(item.servingSize).toBe("1 serving");
      expect(item.usageCount).toBe(0);
      expect(item.source).toBe("manual");
    });

    it("preserves a fully-populated doc", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([
          {
            id: "full",
            data: {
              name: "Boiled eggs",
              calories: 78,
              protein: 6,
              carbs: 1,
              fat: 5,
              servingSize: "1 large",
              usageCount: 12,
              source: "barcode",
              createdAt: "__T0__",
              lastUsedAt: "__T1__",
            },
          },
        ]);
      });
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      const item = result.current.items[0];
      expect(item.calories).toBe(78);
      expect(item.usageCount).toBe(12);
      expect(item.source).toBe("barcode");
      expect(item.lastUsedAt).toBe("__T1__");
    });
  });

  describe("addItem", () => {
    it("addDocs with the input + counters + timestamps", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        const id = await result.current.addItem({
          name: "Greek yoghurt",
          calories: 100,
          protein: 17,
          carbs: 5,
          fat: 0,
          servingSize: "170g",
          source: "manual",
        });
        expect(id).toBe("pantry-1");
      });
      expect(addDocCalls).toHaveLength(1);
      expect(addDocCalls[0]).toMatchObject({
        name: "Greek yoghurt",
        calories: 100,
        usageCount: 0,
        createdAt: "__SERVER_TIMESTAMP__",
        lastUsedAt: "__SERVER_TIMESTAMP__",
        source: "manual",
      });
    });
  });

  describe("updateItem", () => {
    it("setDocs with merge:true and the partial updates", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.updateItem("pantry-1", {
          name: "Greek yoghurt (vanilla)",
        });
      });
      expect(setDocCalls).toHaveLength(1);
      expect(setDocCalls[0]).toEqual({
        id: "pantry-1",
        data: { name: "Greek yoghurt (vanilla)" },
      });
    });
  });

  describe("removeItem", () => {
    it("deleteDocs by id", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.removeItem("pantry-1");
      });
      expect(deleteDocCalls).toEqual(["pantry-1"]);
    });
  });

  describe("recordUsage", () => {
    it("atomically bumps usageCount + stamps lastUsedAt", async () => {
      mockDocState["pantry-1"] = { usageCount: 3 };
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.recordUsage("pantry-1");
      });
      expect(transactionCalls).toHaveLength(1);
      expect(transactionCalls[0].update).toEqual({
        usageCount: 4,
        lastUsedAt: "__SERVER_TIMESTAMP__",
      });
    });

    it("starts usageCount at 1 when the doc has no count field yet", async () => {
      mockDocState["pantry-old"] = { name: "Toast" };
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.recordUsage("pantry-old");
      });
      expect(transactionCalls[0].update).toMatchObject({ usageCount: 1 });
    });

    it("is a no-op when the doc does not exist", async () => {
      const { result } = renderHook(() => usePantry());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        const ok = await result.current.recordUsage("missing");
        // recordUsage returns true even when the doc is missing — the
        // transaction completed without throwing; the no-op semantic
        // is "tried, nothing to bump".
        expect(ok).toBe(true);
      });
      expect(transactionCalls[0].update).toBeNull();
    });
  });
});
