// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BackDismissProvider } from "../BackDismissProvider";
import { useBackDismiss } from "../backDismiss";

vi.mock("../platform", () => ({ isNativePlatform: () => false }));

function Overlay({ open }: { open: boolean }) {
  useBackDismiss(open, () => {});
  return null;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/social?tab=feed");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  "/social?tab=feed&feed=explore",
  "/social?tab=feed#activity",
  "/program",
])("closing an overlay keeps navigation to %s", (destination) => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const view = (open: boolean) => (
    <BackDismissProvider>
      <Overlay open={open} />
    </BackDismissProvider>
  );
  const { rerender } = render(view(true));
  // Router replace-navigation updates the browser URL synchronously while
  // the overlay closes. The provider must inspect that URL in its cleanup.
  window.history.replaceState({}, "", destination);
  rerender(view(false));
  expect(back).not.toHaveBeenCalled();
  expect(
    window.location.pathname + window.location.search + window.location.hash
  ).toBe(destination);
});

it("still consumes the overlay entry when closing without navigation", () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const { rerender } = render(
    <BackDismissProvider>
      <Overlay open />
    </BackDismissProvider>
  );
  rerender(
    <BackDismissProvider>
      <Overlay open={false} />
    </BackDismissProvider>
  );
  expect(back).toHaveBeenCalledTimes(1);
});
