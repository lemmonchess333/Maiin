// @vitest-environment jsdom
/**
 * The minimum-version gate reads `config/client` for a signed-in person
 * and blocks a build below its floor. For someone signed out it reads
 * nothing, and it must not load Firestore to find that out: the gate
 * wraps Login, and a first visit's Login downloads no Firestore.
 *
 * The loads are observed where they land: each Firestore module below is
 * replaced, and its factory runs only when something imports it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const started = vi.hoisted(() => new Set<string>());
const session = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  minSupportedVersion: undefined as string | undefined,
}));

/**
 * Registered for each test with doMock: a hoisted vi.mock factory runs once
 * per file, so after the first test that imports these it would never run
 * again and an empty `started` would prove nothing.
 */
function mockFirebase() {
  vi.doMock("@/lib/firebaseApp", () => ({
    auth: {
      authStateReady: async () => {},
      get currentUser() {
        return session.currentUser;
      },
    },
  }));
  vi.doMock("@/lib/firebase", () => {
    started.add("@/lib/firebase");
    return { db: {} };
  });
  vi.doMock("firebase/firestore", () => {
    started.add("firebase/firestore");
    return {
      doc: () => ({}),
      getDoc: async () => ({
        exists: () => session.minSupportedVersion !== undefined,
        data: () => ({ minSupportedVersion: session.minSupportedVersion }),
      }),
    };
  });
}

/** Long enough for the gate's imports and its read to land. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

async function renderGate() {
  const { default: MinVersionGate } =
    await import("@/components/MinVersionGate");
  render(
    <MinVersionGate>
      <p>The app</p>
    </MinVersionGate>
  );
  await settle();
}

beforeEach(() => {
  vi.resetModules();
  mockFirebase();
  started.clear();
  session.currentUser = null;
  session.minSupportedVersion = undefined;
  vi.stubGlobal("__APP_VERSION__", "1.2.0");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MinVersionGate", () => {
  it("signed out, shows the app and loads no Firestore", async () => {
    session.minSupportedVersion = "9.0.0";
    await renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect([...started]).toEqual([]);
  });

  it("signed in on a build below the floor, blocks the app", async () => {
    session.currentUser = { uid: "u1" };
    session.minSupportedVersion = "9.0.0";
    await renderGate();
    expect(
      screen.getByRole("heading", { name: "Update required" })
    ).toBeInTheDocument();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("signed in on a supported build, shows the app", async () => {
    session.currentUser = { uid: "u1" };
    session.minSupportedVersion = "1.0.0";
    await renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(started).toContain("firebase/firestore");
  });
});
