import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import OutgrownDayNotice from "../OutgrownDayNotice";

/** Train's notice for a day that runs past its length (slice 4): what it
 *  says, the rebuild behind a confirmation, and keeping the day. */
function renderNotice(
  overrides: Partial<Parameters<typeof OutgrownDayNotice>[0]> = {}
) {
  const onRebuild = vi.fn();
  const onKeep = vi.fn();
  render(
    <OutgrownDayNotice
      dayName="Pull A"
      minutes={95}
      length={45}
      rebuilding={false}
      onRebuild={onRebuild}
      onKeep={onKeep}
      {...overrides}
    />
  );
  return { onRebuild, onKeep };
}

describe("OutgrownDayNotice", () => {
  it("names the day, its minutes and the plan's length", () => {
    renderNotice();
    expect(screen.getByText("Pull A takes about 95 min")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your sessions are 45 min. Rebuild your plan to fit them, or keep this day as it is."
      )
    ).toBeInTheDocument();
  });

  it("asks before it rebuilds, and rebuilds on Rebuild", () => {
    const { onRebuild } = renderNotice();
    fireEvent.click(screen.getByRole("button", { name: "Rebuild for 45 min" }));
    expect(onRebuild).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Rebuild your lift days for 45 min?");
    expect(dialog).toHaveTextContent("Your week and history stay");
    fireEvent.click(screen.getByRole("button", { name: "Rebuild" }));
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it("rebuilds nothing on Cancel", () => {
    const { onRebuild } = renderNotice();
    fireEvent.click(screen.getByRole("button", { name: "Rebuild for 45 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRebuild).not.toHaveBeenCalled();
  });

  it("keeps the day on Keep this day", () => {
    const { onKeep, onRebuild } = renderNotice();
    fireEvent.click(screen.getByRole("button", { name: "Keep this day" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onRebuild).not.toHaveBeenCalled();
  });

  it("holds the rebuild button while one runs", () => {
    renderNotice({ rebuilding: true });
    expect(
      screen.getByRole("button", { name: /Rebuild for 45 min/ })
    ).toBeDisabled();
  });
});
