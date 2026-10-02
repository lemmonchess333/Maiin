import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import NewBadgeRow from "../NewBadgeRow";

describe("NewBadgeRow", () => {
  it("names the waiting badge and opens it when tapped", () => {
    const onOpen = vi.fn();
    render(<NewBadgeRow name="Getting Started" onOpen={onOpen} />);
    const row = screen.getByRole("button", {
      name: /New badge\s*Getting Started/,
    });
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
