import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
const h = vi.hoisted(() => ({
  auth: { currentUser: { uid: "runner" } as { uid: string } | null },
  online: true,
  link: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: h.auth }));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: h.online }),
}));
vi.mock("@/features/run/canonicalActivityLink", () => ({
  hasRegisteredActivity: (proof: unknown) => proof !== null,
  linkCanonicalActivity: h.link,
  activityLinkErrorCode: (error: { details?: { errorCode?: string } } | null) =>
    error?.details?.errorCode ?? null,
  resetRejectedActivityLink: h.reset,
}));
import CanonicalActivityLink from "../CanonicalActivityLink";
const props = {
  uid: "runner",
  activityId: "run1",
  proof: { session: { id: "one" } },
};
beforeEach(() => {
  h.auth.currentUser = { uid: "runner" };
  h.online = true;
  h.link.mockReset().mockResolvedValue({});
  h.reset.mockReset().mockReturnValue(true);
});
afterEach(cleanup);
describe("explicit reported-activity action", () => {
  it.each(["light", "dark"])(
    "requires a click and states conservative meaning in %s theme",
    async (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      render(<CanonicalActivityLink {...props} />);
      expect(h.link).not.toHaveBeenCalled();
      expect(screen.getByText(/does not confirm every interval/)).toBeVisible();
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Record against this session" })
        )
      );
      expect(h.link).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(
        "not verified interval completion or progression credit"
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      document.documentElement.classList.remove("dark");
    }
  );
  it("disables offline linking without losing the saved-run explanation", () => {
    h.online = false;
    render(<CanonicalActivityLink {...props} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("saved on the server");
    expect(h.link).not.toHaveBeenCalled();
  });
  it("ignores rapid duplicate clicks and unmounting does not announce success", async () => {
    let resolve!: () => void;
    h.link.mockImplementation(
      () =>
        new Promise<void>((yes) => {
          resolve = yes;
        })
    );
    const view = render(<CanonicalActivityLink {...props} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(h.link).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolve());
    expect(
      screen.queryByText(/Activity recorded against/)
    ).not.toBeInTheDocument();
  });
  it("preserves uncertain requests and offers the same retry", async () => {
    h.link.mockRejectedValue(Error("timeout"));
    render(<CanonicalActivityLink {...props} />);
    await act(async () => fireEvent.click(screen.getByRole("button")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your saved run is kept"
    );
    expect(h.reset).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry recording this activity" })
      )
    );
    expect(h.link).toHaveBeenCalledTimes(2);
  });
  it("a known rejected revision requires separate reset and another explicit confirmation", async () => {
    const rejection = { details: { errorCode: "revision-conflict" } };
    h.link.mockRejectedValue(rejection);
    render(<CanonicalActivityLink {...props} />);
    await act(async () => fireEvent.click(screen.getByRole("button")));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Prepare a new linkage request" })
      )
    );
    expect(h.reset).toHaveBeenCalledWith("runner", "run1", rejection);
    expect(h.link).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Record against this session" })
    ).toBeEnabled();
  });
  it("offers an existing-request retry when guarded reset cannot remove it", async () => {
    h.link.mockRejectedValue({ details: { errorCode: "revision-conflict" } });
    h.reset.mockResolvedValue(false);
    render(<CanonicalActivityLink {...props} />);
    await act(async () => fireEvent.click(screen.getByRole("button")));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Prepare a new linkage request" })
      )
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no request was deleted"
    );
    expect(
      screen.getByRole("button", { name: "Retry recording this activity" })
    ).toBeEnabled();
    expect(h.link).toHaveBeenCalledTimes(1);
  });
  it("hides another account's activity and missing evidence", () => {
    h.auth.currentUser = { uid: "other" };
    const view = render(<CanonicalActivityLink {...props} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    h.auth.currentUser = { uid: "runner" };
    view.rerender(<CanonicalActivityLink {...props} proof={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
