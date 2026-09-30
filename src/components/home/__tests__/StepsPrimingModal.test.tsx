import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StepsPrimingModal from "../StepsPrimingModal";

describe("StepsPrimingModal", function () {
  it("asks once with Not now and Connect, and each answer reaches its handler", async function () {
    const onConnect = vi.fn(function () {
      return Promise.resolve();
    });
    const onDismiss = vi.fn();
    render(
      <StepsPrimingModal open onConnect={onConnect} onDismiss={onDismiss} />
    );

    expect(
      screen.getByRole("dialog", { name: "Count your steps" })
    ).toBeInTheDocument();
    // "Connect", not "Connect Apple Health": the long label wrapped onto
    // two lines in a half-width button at phone width, and the dialog's
    // description already names Apple Health.
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(function () {
      expect(onConnect).toHaveBeenCalledTimes(1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", function () {
    render(
      <StepsPrimingModal open={false} onConnect={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
