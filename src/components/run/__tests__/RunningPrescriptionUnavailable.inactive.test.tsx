import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RunningPrescriptionUnavailable from "../RunningPrescriptionUnavailable";
import {
  CANONICAL_RUNNING_LAUNCH_ENABLED,
  RUNNING_PRESCRIPTION_GATE_ENABLED,
} from "@/features/program/runningPrescriptionFeature";
afterEach(cleanup);
it("omits canonical actions in the inactive build even if a caller supplies canonical props", () => {
  expect(CANONICAL_RUNNING_LAUNCH_ENABLED).toBe(false);
  expect(RUNNING_PRESCRIPTION_GATE_ENABLED).toBe(false);
  const onStart = vi.fn(),
    onReview = vi.fn(),
    onRecord = vi.fn();
  render(
    <RunningPrescriptionUnavailable
      onBack={vi.fn()}
      onRecord={onRecord}
      canonical={{ ready: true, busy: false, onStart, onReview }}
    />
  );
  expect(
    screen.queryByRole("button", { name: "Check and start today's session" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review plan before starting" })
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Record without guidance" })
  );
  expect(onRecord).toHaveBeenCalledWith("gps");
  expect(onStart).not.toHaveBeenCalled();
  expect(onReview).not.toHaveBeenCalled();
});
