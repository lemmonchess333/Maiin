import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useDesktopNavShortcuts } from "../useDesktopNavShortcuts";

const ROUTES = ["/", "/program", "/food", "/social", "/history"] as const;

function Harness({
  enabled = true,
  withDialog = false,
}: {
  enabled?: boolean;
  withDialog?: boolean;
}) {
  const { pathname } = useLocation();
  useDesktopNavShortcuts(ROUTES, pathname, enabled);
  return (
    <div>
      <output data-testid="path">{pathname}</output>
      <input aria-label="Search" />
      <textarea aria-label="Notes" />
      {withDialog && (
        <div role="dialog" aria-modal="true">
          Modal content
        </div>
      )}
    </div>
  );
}

function renderHarness(
  initialPath = "/",
  options?: { enabled?: boolean; withDialog?: boolean }
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<Harness {...options} />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("useDesktopNavShortcuts", () => {
  it("navigates across tabs 1–5 when no input or modal is active", () => {
    renderHarness("/");
    expect(screen.getByTestId("path")).toHaveTextContent("/");

    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("path")).toHaveTextContent("/program");

    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByTestId("path")).toHaveTextContent("/food");

    fireEvent.keyDown(window, { key: "5" });
    expect(screen.getByTestId("path")).toHaveTextContent("/history");

    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });

  it("never hijacks typing inside inputs or textareas", () => {
    renderHarness("/");
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "2" });
    expect(screen.getByTestId("path")).toHaveTextContent("/");

    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "3" });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });

  it("ignores browser modifier shortcuts (Cmd/Ctrl/Alt/Shift)", () => {
    renderHarness("/");
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    fireEvent.keyDown(window, { key: "3", ctrlKey: true });
    fireEvent.keyDown(window, { key: "4", altKey: true });
    fireEvent.keyDown(window, { key: "5", shiftKey: true });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });

  it("does not navigate when a modal dialog is open or shortcuts are disabled", () => {
    const { unmount } = renderHarness("/", { withDialog: true });
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
    unmount();

    renderHarness("/", { enabled: false });
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });
});
