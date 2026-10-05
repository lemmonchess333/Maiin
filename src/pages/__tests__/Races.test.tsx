import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  failNextFirestore,
  flushSnapshots,
  readDoc,
  resetFirestore,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import Races from "../Races";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const session = vi.hoisted(() => ({ online: true }));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: session.online }),
}));
vi.mock("@/features/spaces/raceEventOverrides", async (original) => ({
  ...(await original<typeof import("@/features/spaces/raceEventOverrides")>()),
  useRaceEventOverrides: () => ({}),
}));
vi.mock("@/lib/dateHelpers", async (original) => ({
  ...(await original<typeof import("@/lib/dateHelpers")>()),
  localDateString: () => "2026-10-05",
}));

const path = "users/viewer/settings/savedRaces";
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function Detail() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back to results</button>;
}
function renderPage(entry = "/races") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Location />
      <Routes>
        <Route path="/races" element={<Races />} />
        <Route path="/space/:id" element={<Detail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("race finder screen", () => {
  beforeEach(() => {
    resetFirestore();
    session.online = true;
  });
  it("combines search, distance and month, then clears every filter", async () => {
    renderPage("/races?country=GB");
    await flushSnapshots();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Edinburgh" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "10K" }));
    fireEvent.change(screen.getByLabelText("Month"), {
      target: { value: "2027-05" },
    });
    expect(
      within(screen.getByRole("list", { name: "Races" })).getAllByRole(
        "listitem"
      )
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /View Edinburgh.*10K/ })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "no such event" },
    });
    expect(screen.getByText("No matching races")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Clear filters" })[0]
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Month")).toHaveValue("all");
    expect(
      screen.getByRole("button", { name: "Country: All countries" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Berlin Marathon" })
    ).toBeInTheDocument();
  });
  it("saves privately without navigation or community membership, and restores on remount", async () => {
    const view = renderPage("/races?q=Berlin");
    await flushSnapshots();
    fireEvent.click(
      screen.getByRole("button", { name: "Save Berlin Marathon" })
    );
    await waitFor(() =>
      expect(readDoc(path)?.raceIds).toEqual(["berlin-marathon"])
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/races?q=Berlin");
    expect(writeLog().every((write) => write.path === path)).toBe(true);
    view.unmount();
    renderPage("/races?view=saved");
    await flushSnapshots();
    expect(
      screen.getByRole("list", { name: "Saved races" })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Berlin Marathon from saved races",
      })
    );
    await waitFor(() =>
      expect(screen.getByText("Your next race starts here")).toBeInTheDocument()
    );
    expect(readDoc(path)?.raceIds).toEqual([]);
  });
  it("keeps the exact search and sort when returning from a race", async () => {
    renderPage("/races?q=Berlin&sort=name&country=DE&month=2027-09");
    await flushSnapshots();
    fireEvent.click(screen.getByRole("link", { name: "View Berlin Marathon" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(screen.getByRole("searchbox")).toHaveValue("Berlin");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
    expect(screen.getByLabelText("Month")).toHaveValue("2027-09");
    expect(
      screen.getByRole("button", { name: "Country: Germany" })
    ).toBeInTheDocument();
  });
  it("opens Saved without hiding bookmarks behind the previous country/search", async () => {
    seedFirestore({ [path]: { raceIds: ["berlin-marathon"] } });
    renderPage("/races?country=GB&q=London");
    await flushSnapshots();
    fireEvent.click(screen.getByRole("radio", { name: "Saved" }));
    expect(
      screen.getByRole("link", { name: "View Berlin Marathon" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Only you can see your saved races.")
    ).toBeInTheDocument();
  });
  it("shows a recoverable saved-list error, never a false empty state", async () => {
    failNextFirestore("onSnapshot", { path });
    renderPage("/races?view=saved");
    await waitFor(() =>
      expect(screen.getByText("Couldn't load saved races")).toBeInTheDocument()
    );
    expect(
      screen.queryByText("Your next race starts here")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("Your next race starts here")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse races" }));
    expect(screen.getByRole("list", { name: "Races" })).toBeInTheDocument();
  });
  it("keeps browsing available offline and disables changing bookmarks", async () => {
    session.online = false;
    renderPage("/races?q=Berlin");
    await act(async () => {
      await flushSnapshots();
    });
    expect(
      screen.getByRole("link", { name: "View Berlin Marathon" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Berlin Marathon" })
    ).toBeDisabled();
    expect(
      screen.getByText(/Connect to change your saved races/)
    ).toBeInTheDocument();
  });
});
