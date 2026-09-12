import type { PropsWithChildren } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import SaveRoutineSheet from "../SaveRoutineSheet";

vi.mock("@/lib/auth", () => ({ useUid: () => "owner" }));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children }: PropsWithChildren) => children,
}));

it("keeps seconds in the saved-routine preview and the established numeral font", () => {
  const { container } = render(
    <MemoryRouter>
      <SaveRoutineSheet
        open
        onClose={() => {}}
        defaultName="Core"
        sourceActivityId="post"
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
          {
            exerciseId: "weighted-plank",
            name: "Weighted Plank",
            summary: "2×30×20 kg",
            setCount: 2,
            targetReps: 30,
            targetWeightKg: 20,
          },
        ]}
      />
    </MemoryRouter>
  );
  expect(container.textContent).toContain("3×60 s");
  expect(container.textContent).toContain("2×30 s × 20 kg");
  expect(container.textContent).not.toContain("60 BW");
  expect(
    [...container.querySelectorAll(".font-mono")].some(
      (span) => span.textContent === "60"
    )
  ).toBe(true);
});
