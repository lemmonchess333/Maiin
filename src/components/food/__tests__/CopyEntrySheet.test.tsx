import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Meal } from "@/hooks/useMeals";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import CopyEntrySheet from "../CopyEntrySheet";
import { copyDestinations } from "@/lib/copyDays";

afterEach(cleanup);

const lunch: Meal = {
  id: "m1",
  date: "2026-10-20",
  foodName: "Chicken & rice",
  items: [
    {
      name: "Chicken & rice",
      portionSize: "1 serving",
      calories: 650,
      protein: 45,
      carbs: 70,
      fat: 15,
    },
  ],
  totalCalories: 650,
  totalProtein: 45,
  totalCarbs: 70,
  totalFat: 15,
  meal: "lunch",
  confidence: "manual",
  createdAt: null,
};

describe("copyDestinations", () => {
  it("names today and yesterday, then the short en-GB weekday, newest first", () => {
    const days = copyDestinations("2026-10-28", "2026-07-30");
    expect(days[0]).toEqual({ key: "2026-10-28", label: "Today" });
    expect(days[1]).toEqual({ key: "2026-10-27", label: "Yesterday" });
    expect(days[2]).toEqual({ key: "2026-10-26", label: "Mon 26 Oct" });
    expect(days).toHaveLength(14);
  });

  it("stops at the diary's first day", () => {
    const days = copyDestinations("2026-10-28", "2026-10-26");
    expect(days.map((d) => d.key)).toEqual([
      "2026-10-28",
      "2026-10-27",
      "2026-10-26",
    ]);
  });
});

describe("CopyEntrySheet", () => {
  function renderSheet(
    onSave = vi.fn().mockResolvedValue({ created: [], error: null })
  ) {
    const onClose = vi.fn();
    render(
      <CopyEntrySheet
        sources={[lunch]}
        todayKey="2026-10-28"
        minDate="2026-07-30"
        onClose={onClose}
        onSave={onSave}
      />
    );
    return { onSave, onClose };
  }

  it("logs the entry to the chosen day at the chosen portion, and closes", async () => {
    const { onSave, onClose } = renderSheet();
    expect(screen.getByText(/into lunch on that day/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Day"), {
      target: { value: "2026-10-26" },
    });
    fireEvent.change(screen.getByLabelText("Portion"), {
      target: { value: "1.5" },
    });
    expect(screen.getByText("975")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log to Mon 26 Oct" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [date, selections] = onSave.mock.calls[0];
    expect(date).toBe("2026-10-26");
    expect(selections).toEqual([
      expect.objectContaining({ source: lunch, multiplier: 1.5 }),
    ]);
  });

  it("holds Log while the portion is not a number from 0 to 20", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Portion"), {
      target: { value: "0" },
    });
    expect(screen.getByRole("button", { name: "Log to Today" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/greater than 0/);
  });

  it("keeps the sheet and the same destination after a failed save", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ created: [], error: new Error("offline") })
      .mockResolvedValueOnce({ created: [], error: null });
    const { onClose } = renderSheet(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Log to Today" }));
    expect(
      await screen.findByText("Couldn't save this copy. Try again.")
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Log to Today" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[1][1][0].destinationId).toBe(
      onSave.mock.calls[0][1][0].destinationId
    );
  });
});
