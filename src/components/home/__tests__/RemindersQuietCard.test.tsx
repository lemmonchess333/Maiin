/**
 * Home says it once when a reminder went quiet (App1 Q62): what stopped,
 * why, and the way back to Settings → Notifications.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const attention = vi.hoisted(() => ({
  value: null as null | {
    quiet: string[];
    markShown: ReturnType<typeof vi.fn>;
  },
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useRemindersQuiet: () => attention.value,
}));

import RemindersQuietCard from "../RemindersQuietCard";

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RemindersQuietCard />} />
        <Route path="/settings/notifications" element={<p>Notifications</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RemindersQuietCard", () => {
  it("says which reminders stopped and why, marks it said, and opens Settings", () => {
    attention.value = { quiet: ["streak"], markShown: vi.fn(async () => {}) };
    renderCard();
    expect(screen.getByText("Streak reminders are off")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The last 3 went unopened, so we stopped them. Turn them back on in Settings."
      )
    ).toBeInTheDocument();
    expect(attention.value.markShown).toHaveBeenCalledWith(["streak"]);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("says nothing when nothing went quiet, or outside the reminders", () => {
    attention.value = { quiet: [], markShown: vi.fn() };
    const { container, unmount } = renderCard();
    expect(container).toBeEmptyDOMElement();
    expect(attention.value.markShown).not.toHaveBeenCalled();
    unmount();
    attention.value = null;
    expect(renderCard().container).toBeEmptyDOMElement();
  });
});
