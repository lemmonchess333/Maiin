/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Activity } from "lucide-react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const { initial: _i, animate: _a, transition: _tr, ...rest } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
}));
// Default: motion NOT reduced (exercise the animated path).
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));

import { EmptyState } from "../EmptyState";

function renderES(props: any = {}) {
  return render(
    <MemoryRouter>
      <EmptyState headline="Nothing here yet" {...props} />
    </MemoryRouter>
  );
}

describe("EmptyState (hexagon primitive)", () => {
  it("renders the headline and optional sub", () => {
    renderES({ sub: "Do the thing to populate this." });
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(
      screen.getByText("Do the thing to populate this.")
    ).toBeInTheDocument();
  });

  it("always renders the brand hexagon (a polygon), as a status region", () => {
    const { container } = renderES();
    expect(container.querySelector("polygon")).toBeTruthy();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the chevron cutout when no inner icon is supplied", () => {
    const { container } = renderES();
    // chevron = the polyline; no lucide icon present
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("renders an inner context icon instead of the chevron when provided", () => {
    const { container } = renderES({ icon: Activity });
    // lucide renders an <svg class="lucide ...">; chevron polyline is gone
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("svg.lucide")).toBeTruthy();
  });

  it("renders an href action as a link", () => {
    renderES({ action: { label: "Go", href: "/program" } });
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/program");
  });

  it("renders an onClick action as a button and fires it", () => {
    const onClick = vi.fn();
    renderES({ action: { label: "Browse", onClick } });
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no action control when none is given", () => {
    renderES();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
