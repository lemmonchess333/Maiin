import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useAuth: () => ({ profile: { uid: "u1", distanceUnit: "km" } }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ShoesManager from "../ShoesManager";
import { toast } from "@/lib/toast";
import {
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

it("reports a rejected default change, preserves the choice, and lets the user retry", async () => {
  seedFirestore({
    "users/u1/shoes/a": { name: "A", isDefault: true },
    "users/u1/shoes/b": { name: "B", isDefault: false },
  });
  render(<ShoesManager />);
  await screen.findByText("B");
  failNextFirestore("commit", { code: "unavailable" });
  fireEvent.click(screen.getAllByTitle("Set as default")[1]);
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't change your default shoe. Try again."
    )
  );
  expect(unfiredFailures()).toEqual([]);
  expect(readDoc("users/u1/shoes/a")).toMatchObject({ isDefault: true });
  expect(readDoc("users/u1/shoes/b")).toMatchObject({ isDefault: false });

  fireEvent.click(screen.getAllByTitle("Set as default")[1]);
  await waitFor(() =>
    expect(readDoc("users/u1/shoes/b")).toMatchObject({ isDefault: true })
  );
  expect(readDoc("users/u1/shoes/a")).toMatchObject({ isDefault: false });
  expect(toast.error).toHaveBeenCalledTimes(1);
});
