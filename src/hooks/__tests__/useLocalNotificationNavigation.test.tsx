/**
 * A tapped local notification opens the page it names (the Monday review's
 * `/review`), and only a page the app allows. On the web a notification's
 * click sends its route on a window event, which is what this drives.
 */
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  localNotificationRoute,
  useLocalNotificationNavigation,
} from "../useLocalNotificationNavigation";

function Shell({ ready }: { ready: boolean }) {
  useLocalNotificationNavigation(ready);
  return (
    <Routes>
      <Route path="/" element={<p>Home</p>} />
      <Route path="/review" element={<p>Review</p>} />
      <Route path="/settings" element={<p>Settings</p>} />
    </Routes>
  );
}

const tap = (route: string) =>
  window.dispatchEvent(
    new CustomEvent("tropos:notification-route", { detail: route })
  );

afterEach(cleanup);

describe("useLocalNotificationNavigation", () => {
  it("opens the review when its notification is tapped", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Shell ready />
      </MemoryRouter>
    );
    // The listener is attached once the notifications module has loaded.
    await act(async () => {
      await import("@/lib/notifications");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => tap("/review"));
    expect(await screen.findByText("Review")).toBeInTheDocument();
  });

  it("holds a tap until the app is ready", async () => {
    const view = render(
      <MemoryRouter initialEntries={["/"]}>
        <Shell ready={false} />
      </MemoryRouter>
    );
    await act(async () => {
      await import("@/lib/notifications");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => tap("/review"));
    expect(screen.getByText("Home")).toBeInTheDocument();
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <Shell ready />
      </MemoryRouter>
    );
    expect(await screen.findByText("Review")).toBeInTheDocument();
  });
});

describe("localNotificationRoute", () => {
  it("allows the review and nothing else", () => {
    expect(localNotificationRoute("/review")).toBe("/review");
    expect(localNotificationRoute("/settings")).toBeNull();
    expect(localNotificationRoute("https://example.com")).toBeNull();
    expect(localNotificationRoute(42)).toBeNull();
  });
});
