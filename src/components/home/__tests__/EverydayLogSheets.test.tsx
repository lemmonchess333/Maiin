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
import { kgToLb, lbToKg } from "@/lib/weightUnits";
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
  it("keeps the picker behind Earlier, and saves the day it is set to", async () => {
    /* The picker used to sit open under a "Date" label with Today and
       Yesterday as separate buttons above it — three controls for one
       value. It is now the third segment's disclosure. */
    const close = vi.fn();
    render(<WeightLogSheet uid="u1" unit="kg" onClose={close} />);
    expect(screen.queryByLabelText("Date")).toBeNull();

    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "78.4" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Earlier" }));
    const older = new Date();
    older.setDate(older.getDate() - 5);
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: localDateString(older) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString(older)}`)
    ).toBeDefined();
  });

  it("reads the segment off the date, so the two cannot disagree", async () => {
    /* `dayChoice` is derived rather than stored beside `date`. With a
       second source, picking yesterday inside Earlier would leave the
       control reading Earlier while the value said yesterday — the
       class of drift a duplicated field always eventually produces. */
    render(<WeightLogSheet uid="u1" unit="kg" onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Today" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Earlier" }));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: localDateString(yesterday) },
    });
    expect(screen.getByRole("radio", { name: "Yesterday" })).toBeChecked();
    expect(screen.queryByLabelText("Date")).toBeNull();
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
    // Yesterday is a one-tap segment now, not a trip through the picker.
    fireEvent.click(screen.getByRole("radio", { name: "Yesterday" }));
    failNextFirestore("commit");
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    await flushQueuedWeights("u1");
    await flushQueuedWeights("u1");
    expect(readDoc(`users/u1/bodyweightLogs/${date}`)?.weight).toBe(78.4);
  });
  it("adjusts the dial without saving and preserves the chosen weight through unit switches", async () => {
    const close = vi.fn();
    render(
      <WeightLogSheet uid="u1" unit="kg" initialKg={78.412} onClose={close} />
    );
    fireEvent.change(screen.getByRole("slider", { name: "Weight scale" }), {
      target: { value: "81.6" },
    });
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue("81.6");
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: "lb" }));
    expect(screen.getByLabelText("Weight (lb)")).toHaveValue(
      kgToLb(81.6).toFixed(1)
    );
    fireEvent.click(screen.getByRole("radio", { name: "st" }));
    fireEvent.click(screen.getByRole("radio", { name: "kg" }));
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)?.weight
    ).toBe(81.6);
  });
  it("treats an explicitly typed rounded weight as an edit", async () => {
    const close = vi.fn();
    render(
      <WeightLogSheet uid="u1" unit="kg" initialKg={78.412} onClose={close} />
    );
    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "78.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)?.weight
    ).toBe(78.4);
  });
  it("carries the pounds dial across a stone boundary without an implicit save", () => {
    render(
      <WeightLogSheet
        uid="u1"
        unit="lbs"
        initialKg={lbToKg(167.9)}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "st" }));
    fireEvent.change(screen.getByRole("slider", { name: "Weight scale" }), {
      target: { value: "168" },
    });
    expect(screen.getByLabelText("Weight (st)")).toHaveValue("12");
    expect(screen.getByLabelText("Pounds")).toHaveValue("0");
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)
    ).toBeUndefined();
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
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
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
      expect.objectContaining({ cal: 80, pro: 7 }),
      "lunch"
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Number of usual portions")).toHaveValue(
      "0,5"
    );
  });
});
