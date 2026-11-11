// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { SessionShareAction } from "@/lib/sessionPost";

const h = vi.hoisted(() => ({
  setAsking: null as ((asking: boolean) => void) | null,
}));

vi.mock("@/components/workout/SessionBadge", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", async () => {
  const { useEffect } = await import("react");
  return {
    default: function ShareRow({
      onAskingChange,
    }: {
      onAskingChange?: (asking: boolean) => void;
    }) {
      useEffect(() => {
        h.setAsking = (asking) => onAskingChange?.(asking);
        onAskingChange?.(true);
      }, [onAskingChange]);
      return <p>Share sessions automatically?</p>;
    },
  };
});
vi.mock("@/components/workout/CompletionReminderChoice", () => ({
  default: () => <p>Reminder offer</p>,
}));

import CompletionExtras from "../CompletionExtras";

const share = {
  uid: "u1",
  type: "workout",
  source: { kind: "workout", id: "w1" },
} as unknown as SessionShareAction;

describe("CompletionExtras", () => {
  it("offers reminders only once the share question is answered", async () => {
    render(<CompletionExtras share={share} kind="lift" activationJourneyV2 />);
    await act(async () => {});
    expect(screen.getByText("Share sessions automatically?")).toBeVisible();
    expect(screen.queryByText("Reminder offer")).toBeNull();
    act(() => h.setAsking?.(false));
    expect(await screen.findByText("Reminder offer")).toBeVisible();
  });

  it("offers reminders at once when there is nothing to share", async () => {
    render(<CompletionExtras kind="run" activationJourneyV2 />);
    expect(await screen.findByText("Reminder offer")).toBeVisible();
  });
});
