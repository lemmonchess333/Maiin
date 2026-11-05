/**
 * The live pulse's line on Social's Feed (Soc15): today's count of sessions
 * across Tropos, read live from `pulse/{the viewer's local today}`, drawn
 * from ten sessions up, by a dot that pulses unless Reduce Motion is on.
 *
 * Firestore runs on the one fake (ADR-0009). The day key is built from the
 * clock with the Date's own local getters; which day is the viewer's, and
 * midnight, are usePulse's tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import PulseLine from "../PulseLine";
import { logger } from "@/lib/logger";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { groupText } from "@/test/localeGrouping";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** The day key of `d` on this machine's wall clock. */
const localKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const day = (sessions: number) => ({
  sessions,
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 8 * DAY),
});
const today = () => `pulse/${localKey(new Date())}`;
const line = () => screen.queryByText(/sessions on Tropos$/)?.closest("p");

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  resetFirestore();
  vi.mocked(logger.warn).mockClear();
});
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe("PulseLine", () => {
  it("shows today's count from ten sessions up, and nothing below, live", async () => {
    seedFirestore({ [today()]: day(12) });
    render(<PulseLine />);
    await waitFor(() =>
      expect(line()).toHaveTextContent("Today: 12 sessions on Tropos")
    );
    // Shown first, so its going is the listener hearing 9, not a read
    // that has not landed.
    seedFirestore({ [today()]: day(9) });
    await waitFor(() => expect(line()).toBeFalsy());
    seedFirestore({ [today()]: day(10) });
    await waitFor(() =>
      expect(line()).toHaveTextContent("Today: 10 sessions on Tropos")
    );
  });

  it("draws the figure as the house does, grouped as the locale groups", async () => {
    seedFirestore({ [today()]: day(1248) });
    render(<PulseLine />);
    await waitFor(() => expect(line()).toBeTruthy());
    const figure = screen.getByText(groupText(1248));
    expect(figure).toHaveClass("font-mono", "tabular-nums");
    expect(line()).toHaveTextContent(
      `Today: ${groupText(1248)} sessions on Tropos`
    );
  });

  it("pulses the dot, and holds it still under Reduce Motion", async () => {
    seedFirestore({ [today()]: day(14) });
    const first = render(<PulseLine />);
    await waitFor(() => expect(line()).toBeTruthy());
    expect(screen.getByTestId("pulse-ring")).toHaveClass("ds-live-pulse");
    first.unmount();

    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<PulseLine />);
    await waitFor(() => expect(line()).toBeTruthy());
    expect(screen.queryByTestId("pulse-ring")).toBeNull();
    // The dot itself is still there, still.
    expect(line()!.querySelector(".rounded-full")).not.toBeNull();
  });

  it("shows nothing when the day cannot be read", async () => {
    seedFirestore({ [today()]: day(40) });
    failNextFirestore("onSnapshot", { path: today(), code: "unavailable" });
    render(<PulseLine />);
    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        "[pulse] read failed",
        expect.anything()
      )
    );
    expect(unfiredFailures()).toEqual([]);
    expect(line()).toBeFalsy();
  });
});

describe("where it is drawn", () => {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory())
        return name === "__tests__" ? [] : sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });
  const names = (path: string) =>
    /PulseLine|usePulse/.test(readFileSync(path, "utf8"));

  it("is on Social's Feed and nowhere on Home: calm stops at Social's door", () => {
    expect(names(join(src, "components/social/views/FeedView.tsx"))).toBe(true);
    const home = [
      join(src, "pages/Home.tsx"),
      ...sources(join(src, "components/home")),
    ].filter(names);
    expect(home).toEqual([]);
  });
});
