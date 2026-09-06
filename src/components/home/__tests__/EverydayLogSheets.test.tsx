import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import WeightLogSheet from "../WeightLogSheet";
import WaterSizeSheet from "../WaterSizeSheet";
import QuickMealPortionSheet from "@/components/food/QuickMealPortionSheet";
import {
  resetFirestore,
  readDoc,
  failNextFirestore,
} from "@/test/firestoreHarness";
import { flushQueuedWeights } from "@/lib/weightQueue";
import { localDateString } from "@/lib/dateHelpers";
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(cleanup);
describe("everyday entry sheets", () => {
  it("keeps precise kilograms when the pound display is untouched", async () => {
    const close = vi.fn();
    render(
      <WeightLogSheet uid="u1" unit="lbs" initialKg={78.412} onClose={close} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)?.weight
    ).toBe(78.412);
  });
  it("accepts a comma entry and date locally, then retries a failed sync", async () => {
    const close = vi.fn();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = localDateString(yesterday);
    render(<WeightLogSheet uid="u1" unit="kg" onClose={close} />);
    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "78,4" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: date },
    });
    failNextFirestore("commit");
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    await flushQueuedWeights("u1");
    await flushQueuedWeights("u1");
    expect(readDoc(`users/u1/bodyweightLogs/${date}`)?.weight).toBe(78.4);
  });
  it("changing the usual water size does not log water, and excessive custom amounts are rejected", () => {
    const log = vi.fn(),
      preference = vi.fn();
    render(
      <WaterSizeSheet
        open
        onClose={vi.fn()}
        onLog={log}
        consumedMl={0}
        targetMl={2000}
        onServingChange={preference}
      />
    );
    fireEvent.change(screen.getByLabelText("Quick-add serving"), {
      target: { value: "500" },
    });
    expect(preference).toHaveBeenCalledWith(500);
    expect(log).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Custom amount in millilitres"), {
      target: { value: "99999" },
    });
    expect(
      screen.getByRole("button", { name: "Add" })
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("keeps a corrected meal portion available after failure", async () => {
    const close = vi.fn(),
      log = vi.fn().mockResolvedValue(false);
    render(
      <QuickMealPortionSheet
        meal={{
          key: "eggs",
          name: "Eggs",
          portionSize: "2 eggs",
          cal: 160,
          pro: 14,
          carb: 0,
          fat: 10,
        }}
        onClose={close}
        onLog={log}
      />
    );
    fireEvent.change(screen.getByLabelText("Number of usual portions"), {
      target: { value: "0,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log this portion" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Log this portion" })
      ).toBeEnabled()
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ cal: 80, pro: 7 })
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Number of usual portions")).toHaveValue(
      "0,5"
    );
  });
});
