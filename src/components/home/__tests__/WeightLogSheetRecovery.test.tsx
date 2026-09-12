import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import WeightLogSheet from "../WeightLogSheet";
import { localDateString } from "@/lib/dateHelpers";
import { flushQueuedWeights } from "@/lib/weightQueue";
import { stonePoundsToKg } from "@/lib/weightUnits";
import {
  deferReads,
  pendingReads,
  readDoc,
  readLog,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

describe("weight editor recovery", () => {
  it.each(["light", "dark"])(
    "can clear and correct the date in %s mode",
    async (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      const close = vi.fn();
      render(
        <WeightLogSheet uid="u1" unit="kg" initialKg={80} onClose={close} />
      );
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      const readsBeforeClear = [...readLog()];

      fireEvent.change(screen.getByLabelText("Date measured"), {
        target: { value: "" },
      });
      expect(screen.getByRole("button", { name: "Choose date" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Log" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Choose a day within the last 30 days."
      );
      expect(writeLog()).toHaveLength(0);
      expect(close).not.toHaveBeenCalled();
      expect(readLog()).toEqual(readsBeforeClear);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = localDateString(yesterday);
      fireEvent.change(screen.getByLabelText("Date measured"), {
        target: { value: date },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log" }));
      await flushQueuedWeights("u1");
      expect(readDoc(`users/u1/bodyweightLogs/${date}`)?.weight).toBe(80);
      expect(
        readDoc(`users/u1/bodyweightLogs/${localDateString()}`)
      ).toBeUndefined();
      expect(close).toHaveBeenCalledOnce();
    }
  );

  it("keeps typed pounds through a unit change when the saved weight arrives late", async () => {
    const date = localDateString();
    seedFirestore({
      "users/u1": { weightKg: 80, targetCalories: 2200 },
      [`users/u1/bodyweightLogs/${date}`]: {
        date,
        weight: 80,
        source: "manual",
      },
    });
    deferReads();
    const close = vi.fn();
    render(
      <WeightLogSheet uid="u1" unit="kg" initialKg={80} onClose={close} />
    );
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "st" },
    });
    const stone = Number(
      (screen.getByLabelText("Weight (st)") as HTMLInputElement).value
    );
    fireEvent.change(screen.getByLabelText("Pounds"), {
      target: { value: "10" },
    });
    const enteredKg = stonePoundsToKg(stone, 10);
    fireEvent.change(screen.getByLabelText("Weight unit"), {
      target: { value: "kg" },
    });
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(
      enteredKg.toFixed(1)
    );
    expect(pendingReads()).toHaveLength(3);
    await act(async () => {
      resumeReads();
      releaseAllReads();
    });
    await screen.findByText("Edit weight");
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(
      enteredKg.toFixed(1)
    );
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    await flushQueuedWeights("u1");
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(readDoc(`users/u1/bodyweightLogs/${date}`)?.weight).toBeCloseTo(
      enteredKg,
      8
    );
  });
});
