import type { PropsWithChildren } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import SaveRoutineSheet from "../SaveRoutineSheet";

vi.mock("@/lib/auth", () => ({ useUid: () => "owner" }));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/lib/savedRoutines", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/savedRoutines")>()),
  saveRoutine: vi.fn(async () => "routine-1"),
}));

afterEach(async () => {
  await restoreRealTimers();
});

function renderSheet(onClose: () => void) {
  return render(
    <MemoryRouter>
      <SaveRoutineSheet
        open
        onClose={onClose}
        defaultName="Core"
        sourceAuthorId="owner"
        sourceAuthorName="Owner"
        exercises={[
          {
            exerciseId: "plank",
            name: "Plank",
            summary: "3×60 BW",
            setCount: 3,
            targetReps: 60,
            targetWeightKg: 0,
          },
        ]}
      />
    </MemoryRouter>
  );
}

it("closes once the Saved hold is over", async () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderSheet(onClose);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  expect(screen.getByRole("button", { name: /Saved/ })).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(650);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does nothing once the sheet has gone before the hold is over", async () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const { unmount } = renderSheet(onClose);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  unmount();
  await act(async () => {
    vi.advanceTimersByTime(650);
  });
  expect(onClose).not.toHaveBeenCalled();
});
