// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import ProfileUnavailable from "../ProfileUnavailable";

afterEach(cleanup);

describe("ProfileUnavailable", () => {
  it("says the account could not be loaded, and that it has not changed", () => {
    render(<ProfileUnavailable onRetry={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load your account"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your account hasn’t changed."
    );
  });

  it("reads the profile again on Try again", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<ProfileUnavailable onRetry={onRetry} onSignOut={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says it tried when the read fails again", async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error("unavailable"));
    render(<ProfileUnavailable onRetry={onRetry} onSignOut={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Still no answer.")
    );
    // And it can be tried a third time.
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("tries by itself when the connection comes back", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<ProfileUnavailable onRetry={onRetry} onSignOut={vi.fn()} />);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not start a second read while one is out", async () => {
    let finish!: () => void;
    const onRetry = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    render(<ProfileUnavailable onRetry={onRetry} onSignOut={vi.fn()} />);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("offers a way out to another account", async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    render(<ProfileUnavailable onRetry={vi.fn()} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
