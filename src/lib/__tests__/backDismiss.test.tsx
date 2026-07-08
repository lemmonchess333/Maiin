/**
 * Back-dismiss registry contract. Pins the LIFO stack + dispatch behaviour the
 * native interceptor (and the future web popstate handler) rely on:
 *   - back invokes the topmost active dismisser (LIFO), returns true
 *   - closing the top hands back to the next one down
 *   - empty stack → dispatch returns false (caller navigates normally)
 *   - useBackDismiss no-ops safely outside a provider
 * See lib/backDismiss.ts + BackDismissProvider.tsx.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BackDismissProvider } from "../BackDismissProvider";
import { useBackDismiss, useBackDismissController } from "../backDismiss";

afterEach(() => cleanup());

function BackButton() {
  const { dispatchBack } = useBackDismissController();
  const [res, setRes] = useState("");
  return (
    <button data-testid="back" onClick={() => setRes(String(dispatchBack()))}>
      {res || "back"}
    </button>
  );
}

function Overlay({ active, onBack }: { active: boolean; onBack: () => void }) {
  useBackDismiss(active, onBack);
  return null;
}

describe("back-dismiss registry", () => {
  it("back invokes the single active dismisser and reports handled", () => {
    const onBack = vi.fn();
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={onBack} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("back")).toHaveTextContent("true");
  });

  it("invokes the most-recently-opened overlay first (LIFO)", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={first} />
          <Overlay active onBack={second} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("hands back to the next overlay once the top closes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={first} />
          <Overlay active onBack={second} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    // Top (second) closes → its registration is removed.
    rerender(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={first} />
          <Overlay active={false} onBack={second} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("reports not-handled when no overlay is open", () => {
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active={false} onBack={vi.fn()} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(screen.getByTestId("back")).toHaveTextContent("false");
  });

  it("no-ops safely when used outside a provider", () => {
    expect(() => render(<Overlay active onBack={vi.fn()} />)).not.toThrow();
  });

  it("a trapped (no-op) top overlay swallows back and shields the one below", () => {
    const below = vi.fn();
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={below} />
          {/* Non-dismissible / forced-choice: registers a no-op → traps back. */}
          <Overlay active onBack={() => {}} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("back"));
    // Handled (swallowed) even though nothing closed; the overlay below is NOT
    // reached — back doesn't "fall through" a trap.
    expect(screen.getByTestId("back")).toHaveTextContent("true");
    expect(below).not.toHaveBeenCalled();
  });

  it("a throwing handler is swallowed (never bricks the back button)", () => {
    const below = vi.fn();
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={below} />
          <Overlay
            active
            onBack={() => {
              throw new Error("handler boom");
            }}
          />
        </BackDismissProvider>
      </MemoryRouter>
    );
    // Back must not throw, and must still report handled (swallowed) so the
    // native listener doesn't fall through to navigate/exit.
    expect(() => fireEvent.click(screen.getByTestId("back"))).not.toThrow();
    expect(screen.getByTestId("back")).toHaveTextContent("true");
    expect(below).not.toHaveBeenCalled();
  });

  it("repeated back on the same overlay is idempotent-safe (no cascade)", () => {
    // dispatchBack doesn't pop, so a rapid double-press re-invokes the SAME
    // top handler rather than cascade-closing the overlay beneath it.
    const top = vi.fn();
    const below = vi.fn();
    render(
      <MemoryRouter>
        <BackDismissProvider>
          <BackButton />
          <Overlay active onBack={below} />
          <Overlay active onBack={top} />
        </BackDismissProvider>
      </MemoryRouter>
    );
    const btn = screen.getByTestId("back");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(top).toHaveBeenCalledTimes(2); // same handler, twice
    expect(below).not.toHaveBeenCalled(); // never cascaded to the one below
  });
});
