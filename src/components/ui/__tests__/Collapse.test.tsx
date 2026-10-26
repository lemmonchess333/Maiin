import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Collapse } from "../Collapse";

/**
 * A disclosure's section: mounted only while open, opening from nothing
 * when the control is tapped, already there when it mounts open (Pol1),
 * and closing on what it last drew.
 */

describe("Collapse", () => {
  it("mounts its content only while open, with the id the control names", () => {
    const { rerender } = render(
      <Collapse open={false} id="details">
        <p>Details</p>
      </Collapse>
    );
    expect(screen.queryByText("Details")).toBeNull();

    rerender(
      <Collapse open id="details">
        <p>Details</p>
      </Collapse>
    );
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(document.getElementById("details")).toContainElement(
      screen.getByText("Details")
    );
  });

  it("opens from nothing, clipped only while it moves", async () => {
    const { rerender } = render(
      <Collapse open={false} id="details">
        <p>Details</p>
      </Collapse>
    );
    rerender(
      <Collapse open id="details">
        <p>Details</p>
      </Collapse>
    );
    const section = document.getElementById("details")!;
    expect(section.style.height).toBe("0px");
    expect(section.style.opacity).toBe("0");
    // Every clip the section is given, however fast the machine.
    const clips = [section.style.overflow];
    const observer = new MutationObserver(() =>
      clips.push(section.style.overflow)
    );
    observer.observe(section, { attributeFilter: ["style"] });
    // Open and still: unclipped, so focus rings draw past its edge.
    await waitFor(() => expect(section.style.opacity).toBe("1"));
    await waitFor(() => expect(section.style.overflow).toBe(""));
    observer.disconnect();
    expect(clips).toContain("hidden");
  });

  it("closes clipped and takes no taps while it goes", async () => {
    const { rerender } = render(
      <Collapse open id="details">
        <p>Details</p>
      </Collapse>
    );
    rerender(
      <Collapse open={false} id="details">
        <p>Details</p>
      </Collapse>
    );
    const section = document.getElementById("details")!;
    await waitFor(() => expect(section.style.pointerEvents).toBe("none"));
    expect(section.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.getElementById("details")).toBeNull());
  });

  it("just shows a section that is open when it mounts", () => {
    render(
      <Collapse open id="details">
        <p>Details</p>
      </Collapse>
    );
    const section = document.getElementById("details")!;
    expect(section.style.opacity).not.toBe("0");
    expect(section.style.height).not.toBe("0px");
  });

  it("under Reduce Motion, opens and closes without a fade", async () => {
    const real = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList;
    try {
      const { rerender } = render(
        <Collapse open={false} id="details">
          <p>Details</p>
        </Collapse>
      );
      rerender(
        <Collapse open id="details">
          <p>Details</p>
        </Collapse>
      );
      // The height still opens from nothing (MotionConfig settles it in
      // the app); the opacity is never taken down to start a fade.
      const section = document.getElementById("details")!;
      expect(section.style.opacity).not.toBe("0");
      rerender(
        <Collapse open={false} id="details">
          <p>Details</p>
        </Collapse>
      );
      expect(section.style.opacity).not.toBe("0");
      await waitFor(() =>
        expect(document.getElementById("details")).toBeNull()
      );
    } finally {
      window.matchMedia = real;
    }
  });

  it("builds function content only while open, and closes on what it last drew", async () => {
    const build = vi.fn(() => <p>Days</p>);
    const { rerender } = render(<Collapse open={false}>{build}</Collapse>);
    expect(build).not.toHaveBeenCalled();

    rerender(<Collapse open>{build}</Collapse>);
    expect(build).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Days")).toBeInTheDocument();

    rerender(<Collapse open={false}>{build}</Collapse>);
    expect(build).toHaveBeenCalledTimes(1);
    // Leaving: still drawn while it closes, then gone.
    expect(screen.getByText("Days")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Days")).toBeNull());
  });
});
