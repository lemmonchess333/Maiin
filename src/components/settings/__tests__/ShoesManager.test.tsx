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
  writeLog,
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

/* Adding a shoe awaited its write with no catch and no busy state: a
   refused write was an unhandled rejection with the form left open and
   nothing said, a double tap wrote two shoes, and the input's `min` did
   not stop a typed 0 or negative limit, which flagged the shoe as worn out
   on its first run. */
function openAddForm(name: string, replaceAt: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.change(screen.getByLabelText("Shoe name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Replace at"), {
    target: { value: replaceAt },
  });
}
// The fake logs an addDoc as the `set` of its new document.
const addedShoes = () =>
  writeLog().filter(
    (w) => w.op === "set" && w.path.startsWith("users/u1/shoes/")
  );

it("says so when adding a shoe fails, and keeps the form", async () => {
  render(<ShoesManager />);
  await screen.findByText("No shoes added yet");
  openAddForm("Pegasus 41", "");
  failNextFirestore("addDoc", { code: "permission-denied" });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't add the shoe. Try again."
    )
  );
  expect(unfiredFailures()).toEqual([]);
  expect(screen.getByLabelText("Shoe name")).toHaveValue("Pegasus 41");
});

it("refuses a replace-at below the floor, and writes nothing", async () => {
  render(<ShoesManager />);
  await screen.findByText("No shoes added yet");
  openAddForm("Pegasus 41", "-100");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Replace at needs to be at least 50 km."
    )
  );
  expect(addedShoes()).toEqual([]);
});

it("writes one shoe for a double tap on Save", async () => {
  render(<ShoesManager />);
  await screen.findByText("No shoes added yet");
  openAddForm("Pegasus 41", "600");
  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(addedShoes()).toHaveLength(1));
  expect(toast.error).not.toHaveBeenCalled();
});
