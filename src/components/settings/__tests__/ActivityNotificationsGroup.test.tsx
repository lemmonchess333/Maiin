/**
 * ActivityNotificationsGroup — a switch per kind of activity notification
 * (S3). The server reads the same map and writes nothing for a kind that
 * is off; that half is pinned in functions/__tests__/socialFanout.test.js
 * and the agreement between the two in notificationPreferences.cross.test.ts.
 *
 * Here: each switch shows what the server will do (a stored choice, else
 * the default), and a flip saves the whole map, shows at once, and goes
 * back if the save fails. The harness stands in for AuthProvider:
 * `updateProfile` changes the profile when the save succeeds and leaves it
 * when it fails, as the real one does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import type { NotificationPreferences } from "@/lib/notificationPreferences";

const auth = vi.hoisted(() => ({
  profile: null as null | {
    uid: string;
    notificationPreferences?: NotificationPreferences | null;
  },
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import ActivityNotificationsGroup from "../ActivityNotificationsGroup";

function switchFor(label: string) {
  return screen.getByRole("switch", { name: label });
}

function shown() {
  return Object.fromEntries(
    ["Props", "Comments", "New followers", "Circles", "Spaces"].map((l) => [
      l,
      switchFor(l).getAttribute("aria-checked") === "true",
    ])
  );
}

beforeEach(() => {
  auth.profile = { uid: "u1" };
  auth.updateProfile = vi.fn(
    async (patch: { notificationPreferences: NotificationPreferences }) => {
      auth.profile = { ...auth.profile!, ...patch };
      return { ok: true };
    }
  );
});

afterEach(() => cleanup());

describe("ActivityNotificationsGroup", () => {
  it("shows S3's defaults to someone who never chose", () => {
    render(<ActivityNotificationsGroup />);
    expect(shown()).toEqual({
      Props: true,
      Comments: true,
      "New followers": false,
      Circles: true,
      Spaces: true,
    });
  });

  it("shows a stored choice over the default", () => {
    auth.profile = {
      uid: "u1",
      notificationPreferences: { kudos: false, follows: true },
    };
    render(<ActivityNotificationsGroup />);
    expect(shown()).toMatchObject({
      Props: false,
      "New followers": true,
      Comments: true,
    });
  });

  it("saves the whole map, defaults filled in, when a switch flips", async () => {
    render(<ActivityNotificationsGroup />);
    await act(async () => {
      fireEvent.click(switchFor("New followers"));
    });
    expect(auth.updateProfile).toHaveBeenCalledTimes(1);
    expect(auth.updateProfile).toHaveBeenCalledWith({
      notificationPreferences: {
        kudos: true,
        comments: true,
        follows: true,
        circles: true,
        spaces: true,
      },
    });
    expect(switchFor("New followers")).toHaveAttribute("aria-checked", "true");
  });

  it("shows the change while the save is in flight, and keeps it once saved", async () => {
    let finish!: () => void;
    auth.updateProfile = vi.fn(
      (patch: { notificationPreferences: NotificationPreferences }) =>
        new Promise((resolve) => {
          finish = () => {
            auth.profile = { ...auth.profile!, ...patch };
            resolve({ ok: true });
          };
        })
    );
    render(<ActivityNotificationsGroup />);
    fireEvent.click(switchFor("Props"));
    expect(switchFor("Props")).toHaveAttribute("aria-checked", "false");
    await act(async () => finish());
    expect(switchFor("Props")).toHaveAttribute("aria-checked", "false");
  });

  it("goes back when the save fails", async () => {
    auth.updateProfile = vi.fn(async () => ({
      ok: false,
      error: new Error("permission-denied"),
    }));
    render(<ActivityNotificationsGroup />);
    await act(async () => {
      fireEvent.click(switchFor("Circles"));
    });
    expect(auth.updateProfile).toHaveBeenCalledTimes(1);
    expect(switchFor("Circles")).toHaveAttribute("aria-checked", "true");
  });

  it("keeps an earlier flip when two saves overlap", async () => {
    const pending: Array<() => void> = [];
    auth.updateProfile = vi.fn(
      (patch: { notificationPreferences: NotificationPreferences }) =>
        new Promise((resolve) => {
          pending.push(() => {
            auth.profile = { ...auth.profile!, ...patch };
            resolve({ ok: true });
          });
        })
    );
    render(<ActivityNotificationsGroup />);
    fireEvent.click(switchFor("Props"));
    fireEvent.click(switchFor("Spaces"));
    // The second save carries the first flip too.
    expect(auth.updateProfile).toHaveBeenLastCalledWith({
      notificationPreferences: expect.objectContaining({
        kudos: false,
        spaces: false,
      }),
    });
    // The first save settling must not show the second flip undone.
    await act(async () => pending[0]());
    expect(switchFor("Spaces")).toHaveAttribute("aria-checked", "false");
    await act(async () => pending[1]());
    expect(shown()).toMatchObject({ Props: false, Spaces: false });
  });

  it("says where these appear, and that they are not phone notifications", () => {
    render(<ActivityNotificationsGroup />);
    expect(
      screen.getByText(
        "These show under the bell on Social, not as phone notifications."
      )
    ).toBeInTheDocument();
  });
});
