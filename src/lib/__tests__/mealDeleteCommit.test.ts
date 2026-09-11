/**
 * A soft-delete that fails must give the row — and its calories — back.
 *
 * The diary hides a deleted row immediately and subtracts its calories
 * from the day, then writes the soft-delete when the undo window closes.
 * Nothing took the id back out of the hidden set on the failure path, and
 * the hidden set is what both the row list and the day's total are
 * filtered by, so a refused write produced a meal that was saved and
 * invisible with the day's total silently short.
 *
 * Delete is also per-ROW, and a row is a group of identical entries
 * ("Rice x3"), so these run over several ids at once. A partial failure is
 * the interesting case: the ones that landed must stay gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitMealDeletes } from "@/lib/mealDeleteCommit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function deps(
  overrides: Partial<Parameters<typeof commitMealDeletes>[2]> = {}
) {
  return {
    deleteMeal: vi.fn(async () => {}),
    restore: vi.fn(),
    report: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("commitMealDeletes", () => {
  it("restores nothing and says nothing when every delete lands", async () => {
    const d = deps();
    await commitMealDeletes(["a", "b", "c"], "Rice", d);
    expect(d.deleteMeal).toHaveBeenCalledTimes(3);
    // The ids deliberately stay hidden on success: the Firestore snapshot
    // that drops the meals is what clears them, and un-hiding first
    // flashes the rows back into the list.
    expect(d.restore).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it("restores the row and reports when the only delete fails", async () => {
    const d = deps({
      deleteMeal: vi.fn(async () => {
        throw new Error("permission-denied");
      }),
    });
    await commitMealDeletes(["a"], "Boiled egg", d);
    expect(d.restore).toHaveBeenCalledWith(["a"]);
    expect(d.report).toHaveBeenCalledWith("Boiled egg");
  });

  it("restores ONLY the ids whose write failed", async () => {
    const d = deps({
      deleteMeal: vi.fn(async (id: string) => {
        if (id === "b") throw new Error("permission-denied");
      }),
    });
    await commitMealDeletes(["a", "b", "c"], "Rice", d);
    expect(d.restore).toHaveBeenCalledTimes(1);
    expect(d.restore).toHaveBeenCalledWith(["b"]);
    // One message for the row, not one per failed entry.
    expect(d.report).toHaveBeenCalledTimes(1);
  });

  it("attempts every id even after one rejects", async () => {
    const attempted: string[] = [];
    const d = deps({
      deleteMeal: vi.fn(async (id: string) => {
        attempted.push(id);
        if (id === "a") throw new Error("permission-denied");
      }),
    });
    await commitMealDeletes(["a", "b", "c"], "Rice", d);
    expect(attempted.sort()).toEqual(["a", "b", "c"]);
  });

  it("waits for the writes — a pending delete is not a failed one", async () => {
    // Offline, the SDK applies the write locally and leaves the promise
    // pending until it syncs. Resolving the caller before the writes settle
    // would make that look like success; treating it as failure would
    // un-hide a row the user deleted. Neither: the call simply waits.
    let settle: (() => void) | null = null;
    const d = deps({
      deleteMeal: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          })
      ),
    });
    let done = false;
    const pending = commitMealDeletes(["a"], "Rice", d).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(d.restore).not.toHaveBeenCalled();
    settle!();
    await pending;
    expect(done).toBe(true);
    expect(d.restore).not.toHaveBeenCalled();
  });
});

/* The helper is only worth anything if the page reaches it. Food.tsx is
   not renderable in jsdom — the tree hangs — so the wiring is pinned at
   the source instead: both delete paths go through the commit, and
   neither calls the raw soft-delete on its own again. */
describe("Food.tsx routes its deletes through the commit", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const food = readFileSync(resolve(repoRoot, "src/pages/Food.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("imports the commit and uses it on both delete paths", () => {
    expect(food).toMatch(
      /import \{ commitMealDeletes \} from "@\/lib\/mealDeleteCommit"/
    );
    // The serving-stepper decrement and the row delete.
    expect(food.match(/commitDeletes\(/g)?.length).toBe(2);
  });

  it("never calls deleteMeal outside the commit's dependency wiring", () => {
    // `deleteMeal,` in the useMeals destructure and the one handed to
    // commitMealDeletes. A third occurrence means a call site went around
    // the recovery again.
    expect(food.match(/\bdeleteMeal\b/g)?.length).toBe(3);
    expect(food).not.toMatch(/deleteMeal\(/);
  });
});
