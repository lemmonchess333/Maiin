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
  seedFirestore,
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
  it("keeps the picker behind Today, and saves the selected date", async () => {
    /* The picker used to sit open under a "Date" label with Today and
       Yesterday as separate buttons above it — three controls for one
       value. It is now the third segment's disclosure. */
    const close = vi.fn();
    render(<WeightLogSheet uid="u1" unit="kg" onClose={close} />);
    expect(screen.queryByLabelText("Date measured")).toBeNull();

    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "78.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const older = new Date();
    older.setDate(older.getDate() - 5);
    fireEvent.change(screen.getByLabelText("Date measured"), {
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
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    fireEvent.change(screen.getByLabelText("Date measured"), {
      target: { value: localDateString(yesterday) },
    });
    expect(screen.getByLabelText("Date measured")).toHaveValue(
      localDateString(yesterday)
    );
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    fireEvent.change(screen.getByLabelText("Date measured"), {
      target: { value: date },
    });
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
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "lbs" },
    });
    expect(screen.getByLabelText("Weight (lb)")).toHaveValue(
      kgToLb(81.6).toFixed(1)
    );
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "st" },
    });
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "kg" },
    });
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
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "st" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Weight scale" }), {
      target: { value: "168" },
    });
    expect(screen.getByLabelText("Weight (st)")).toHaveValue("12");
    expect(screen.getByLabelText("Pounds")).toHaveValue("0");
    expect(
      readDoc(`users/u1/bodyweightLogs/${localDateString()}`)
    ).toBeUndefined();
  });
  it("keeps presets available during custom entry and rejects excessive amounts", () => {
    const log = vi.fn();
    render(<WaterSizeSheet open onClose={vi.fn()} onLog={log} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Other amount" }));
    expect(
      screen.getByRole("button", { name: "Add 500 ml bottle" })
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Amount (ml)"), {
      target: { value: "99999" },
    });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(log).not.toHaveBeenCalled();
  });
  it("reopens a saved weight with a durable correction and no success toast", async () => {
    const { queueWeightEntry } = await import("@/lib/weightQueue");
    const { toast } = await import("@/lib/toast");
    const date = localDateString();
    seedFirestore({ "users/u1": { weightKg: 80, targetCalories: 2200 } });
    queueWeightEntry("u1", date, 81);
    await flushQueuedWeights("u1");
    const close = vi.fn();
    render(
      <WeightLogSheet
        uid="u1"
        unit="kg"
        initialKg={75}
        lastLoggedDate={date}
        onClose={close}
      />
    );
    await screen.findByRole("button", { name: "Remove entry" });
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue("81.0");
    fireEvent.click(screen.getByRole("button", { name: "Remove entry" }));
    await flushQueuedWeights("u1");
    expect(readDoc(`users/u1/bodyweightLogs/${date}`)).toBeUndefined();
    expect(readDoc("users/u1")?.weightKg).toBe(80);
    expect(close).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("preserves a custom amount after a failed save, then logs and closes on retry", () => {
    const log = vi.fn().mockReturnValue(false),
      close = vi.fn();
    render(<WaterSizeSheet open onClose={close} onLog={log} />);
    fireEvent.click(screen.getByRole("button", { name: "Other amount" }));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(log).toHaveBeenCalledWith(400);
    expect(screen.getByRole("spinbutton")).toHaveValue(400);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    expect(close).not.toHaveBeenCalled();
    log.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("logs a preset directly without a second confirmation", () => {
    const log = vi.fn(),
      close = vi.fn();
    render(<WaterSizeSheet open onClose={close} onLog={log} />);
    fireEvent.click(screen.getByRole("button", { name: "Add 750 ml large" }));
    expect(log).toHaveBeenCalledWith(750);
    expect(close).toHaveBeenCalledOnce();
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

describe("weight sheet — what changed since last time", () => {
  /* The tape shows ~3.4 units, so unlike the arc it cannot be read as a
     sanity check against a fat-fingered entry — and neither could the
     arc once the keyboard shrank the sheet. The caption is that check,
     and it survives typing. */
  /* InlineNumerals splits digits into their own spans, so match on the
     paragraph's textContent rather than on a single text node. */
  const caption = () =>
    Array.from(document.querySelectorAll("p"))
      .map((el) => el.textContent || "")
      .find((t) => /First weigh-in|Same as|vs /.test(t)) || "";

  it("opens level with the last entry, then names the change", () => {
    render(
      <WeightLogSheet
        uid="u1"
        unit="kg"
        initialKg={100}
        lastLoggedDate="2026-09-04"
        onClose={vi.fn()}
      />
    );
    // Nothing typed yet, so the reading still IS the last entry.
    expect(caption()).toMatch(/Same as 4 Sep/);

    fireEvent.change(screen.getByLabelText(/^Weight \(/), {
      target: { value: "98.4" },
    });
    expect(caption()).toMatch(/\u22121\.6 kg vs 4 Sep/);
  });

  it("says so on a first weigh-in rather than comparing against nothing", () => {
    render(<WeightLogSheet uid="u1" unit="kg" onClose={vi.fn()} />);
    expect(screen.getByText("First weigh-in")).toBeInTheDocument();
  });

  it("is uncoloured — it does not judge the direction", () => {
    /* Down is good for a cutter and bad for a lean bulker, and this
       sheet never reads program.goal. A success/destructive tint would
       moralise a number it has no basis to judge. */
    render(
      <WeightLogSheet
        uid="u1"
        unit="kg"
        initialKg={100}
        lastLoggedDate="2026-09-04"
        onClose={vi.fn()}
      />
    );
    const caption = screen.getByText(/First weigh-in|Same as|vs /);
    const classes = caption.closest("p")!.className;
    expect(classes).toMatch(/text-muted-foreground/);
    expect(classes).not.toMatch(/text-(success|destructive|running)/);
  });
});
