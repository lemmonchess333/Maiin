// @vitest-environment jsdom
/**
 * The share sheet and the one-time maintenance sit at the app's root, and
 * both import Firestore. A signed-out visit must load neither, so the
 * Login a first visit sees downloads no Firestore; once someone is signed
 * in, both load.
 *
 * The loads are observed where they land: each module below is replaced,
 * and its factory runs only when something imports it. They are registered
 * per test with doMock, since a hoisted vi.mock factory runs once per file
 * and an empty set would prove nothing after the first test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const started = vi.hoisted(() => new Set<string>());
const session = vi.hoisted(() => ({ uid: null as string | null }));

function mockOverlays() {
  vi.doMock("@/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth")>()),
    useUid: () => session.uid,
  }));
  vi.doMock("@/components/social/ShareComposerSheet", () => {
    started.add("ShareComposerSheet");
    return { default: () => null };
  });
  vi.doMock("@/components/OneTimeMaintenance", () => {
    started.add("OneTimeMaintenance");
    return { default: () => null };
  });
}

/** Long enough for every import() the render started to land. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.resetModules();
  mockOverlays();
  started.clear();
  session.uid = null;
});

describe("the root overlays", () => {
  it("signed out, loads neither the share sheet nor the maintenance", async () => {
    const { SignedInRootOverlays } = await import("@/App");
    render(<SignedInRootOverlays />);
    await settle();
    expect([...started]).toEqual([]);
  });

  it("signed in, loads both", async () => {
    session.uid = "u1";
    const { SignedInRootOverlays } = await import("@/App");
    render(<SignedInRootOverlays />);
    await waitFor(() =>
      expect([...started].sort()).toEqual([
        "OneTimeMaintenance",
        "ShareComposerSheet",
      ])
    );
  });
});
