/**
 * The offline-queue journey's way into Account, pinned against the real
 * Settings list.
 *
 * `offlineQueueIsolation.auth.spec.ts` signs out through the app's own UI:
 * Home → Settings → the Account row → Sign out. It finds the Account row by
 * the row's description. When the Settings pass rewrote the list, the
 * description changed from "Sign out, delete account" to "Email, password,
 * sign out", and the spec's regex matched nothing: the journey timed out
 * in the emulator job, which is the only place it runs.
 *
 * So the regex is read out of the spec here and run against the rendered
 * list. If either side moves, this fails in the unit suite.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "e2e-test@tropos.test" },
    profile: { uid: "u1", displayName: "E2E Tester" },
  }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isInTrial: false, trialDaysLeft: 0, tier: "free" }),
}));
vi.mock("@/components/settings/SettingsAvatar", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/SettingsOfflineBanner", () => ({
  default: () => null,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import SettingsIndex from "../SettingsIndex";

// Vite defines this at build time; the unit suite does not.
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The literal the journey actually uses — not a copy of it. */
function journeySelector(): RegExp {
  const spec = readFileSync(
    resolve(repoRoot, "e2e/offlineQueueIsolation.auth.spec.ts"),
    "utf8"
  );
  const m = spec.match(
    /The Settings list's Account row[\s\S]{0,200}?page\.getByRole\("button", \{ name: \/(.+?)\/i \}\)/
  );
  if (!m) {
    throw new Error(
      "could not find the Account-row selector in offlineQueueIsolation.auth.spec.ts — " +
        "if the spec was restructured, retarget this extractor rather than deleting it"
    );
  }
  return new RegExp(m[1], "i");
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

afterEach(cleanup);

describe("the journey's Account-row selector", () => {
  it("matches exactly one row on the Settings list, and it opens Account", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsIndex />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    );
    const rows = screen.getAllByRole("button", { name: journeySelector() });
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0]);
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/account");
  });
});
