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
      <BackDismissProvider>
        <BackButton />
        <Overlay active onBack={onBack} />
      </BackDismissProvider>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("back")).toHaveTextContent("true");
  });

  it("invokes the most-recently-opened overlay first (LIFO)", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <BackDismissProvider>
        <BackButton />
        <Overlay active onBack={first} />
        <Overlay active onBack={second} />
      </BackDismissProvider>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("hands back to the next overlay once the top closes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <BackDismissProvider>
        <BackButton />
        <Overlay active onBack={first} />
        <Overlay active onBack={second} />
      </BackDismissProvider>
    );
    // Top (second) closes → its registration is removed.
    rerender(
      <BackDismissProvider>
        <BackButton />
        <Overlay active onBack={first} />
        <Overlay active={false} onBack={second} />
      </BackDismissProvider>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("reports not-handled when no overlay is open", () => {
    render(
      <BackDismissProvider>
        <BackButton />
        <Overlay active={false} onBack={vi.fn()} />
      </BackDismissProvider>
    );
    fireEvent.click(screen.getByTestId("back"));
    expect(screen.getByTestId("back")).toHaveTextContent("false");
  });

  it("no-ops safely when used outside a provider", () => {
    expect(() => render(<Overlay active onBack={vi.fn()} />)).not.toThrow();
  });
});
