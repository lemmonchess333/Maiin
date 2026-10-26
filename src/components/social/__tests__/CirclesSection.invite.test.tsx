/**
 * CIRCLE-INVITE-ACTIVATION-01 — a new circle is useful immediately:
 * (a) creating hands off straight into the "Your circle is ready"
 *     invite sheet with the RETURNED code (Share / Copy / Not now);
 * (b) a one-member circle's featured card leads with "Invite someone"
 *     (the focus action moves to the detail sheet); multi-member
 *     circles keep the focus button; a non-owner solo member (no
 *     inviteCode) falls back to the focus button.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import { loadWordFilter } from "@/lib/wordFilter";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
/* CirclesSection reads useSearchParams (PROGRAM-CIRCLE-01 hand-off),
   so renders need a Router. The partial mock below keeps the real
   MemoryRouter. */
import { MemoryRouter } from "react-router-dom";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const trackSocial = vi.fn();
vi.mock("@/lib/socialAnalytics", () => ({
  track: (...args: unknown[]) => trackSocial(...args),
}));

const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));

vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";
import { toast } from "@/lib/toast";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/profanityFilter";

const DAY = 86_400_000;
/** A code made just now: it works for another seven days. */
const fresh = () => Date.now() + 7 * DAY;

function summary(
  id: string,
  title: string,
  memberCount: number,
  inviteCode: string | null,
  inviteCodeExpiresAt: number | null = inviteCode === null ? null : fresh()
): CircleSummary {
  return {
    space: {
      id,
      type: "strength_block",
      title,
      visibility: "invite_only",
      ownerId: "owner-1",
      memberCount,
      maxMembers: 8,
      targetDate: null,
      active: true,
      createdAt: 1,
    },
    inviteCode,
    inviteCodeExpiresAt,
  };
}

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    circles: [] as CircleSummary[],
    loadFailed: false,
    reload: vi.fn(),
    createCircle: vi.fn(async () => ({
      spaceId: "new-space",
      inviteCode: "new-code",
      inviteCodeExpiresAt: fresh(),
    })),
    renewInviteCode: vi.fn(async () => ({
      inviteCode: "NEWC0DE3",
      inviteCodeExpiresAt: fresh(),
    })),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn(async () => ({ members: [], events: [] })),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    ...overrides,
  };
}

/* Unmount, then yield ONE macrotask before the file can end.
 *
 * These tests open vaul Drawers, which wrap Radix Dialog. Radix's
 * FocusScope defers its close handling to a `setTimeout(…, 0)` scheduled
 * in the effect CLEANUP, so the work lands one macrotask AFTER unmount:
 *
 *   return () => { … setTimeout(() => {
 *     const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, …);
 *     container.dispatchEvent(unmountEvent);        // ← the hazard
 *   }, 0); };
 *
 * Let the file end with that timer pending and Vitest swaps the jsdom
 * realm first. The callback then builds its CustomEvent from the NEW
 * realm and dispatches it on a container from the OLD one, so jsdom's
 * IDL conversion rejects the cross-realm event:
 *
 *   TypeError: Failed to execute 'dispatchEvent' on 'EventTarget':
 *   parameter 1 is not of type 'Event'
 *
 * That surfaces as an UNHANDLED error rather than a test failure — the
 * suite reports every test passing and still exits non-zero, which is
 * horrible to diagnose from a CI log (it took a run reporting
 * 5385/5385 green to track down).
 *
 * Deliberately scoped to THIS file rather than the shared setup. A
 * global afterEach flush was tried first and regressed
 * `Tooltip.test.tsx`: letting deferred work run after cleanup can strand
 * a portal node in document.body, where the next test's `screen` query
 * finds it. The blast radius isn't worth it — the hazard belongs to
 * suites that mount Drawers, so the drain lives with them.
 *
 * `src/test/__tests__/drawerUnmountTimerFlush.test.tsx` pins the
 * load-bearing assumption: that ONE macrotask is enough to drain it.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(async () => {}) },
  });
});

describe("post-create invite hand-off", () => {
  it("creating a circle opens 'Your circle is ready' with the returned code", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    // Start a circle → Strength Block preselects the create sheet.
    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Autumn block" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));

    await waitFor(() =>
      expect(screen.getByText("Your circle is ready")).toBeInTheDocument()
    );
    // The RETURNED invite code, in the copyable row.
    expect(screen.getByText("new-space.new-code")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "new-space.new-code"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    // vaul keeps the sheet mounted through its close animation (which
    // jsdom never finishes) — assert the dialog's state flipped
    // instead of waiting for unmount.
    await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      expect(
        dialog === null || dialog.getAttribute("data-state") === "closed"
      ).toBe(true);
    });
  });

  it("a name the word filter refuses is never sent, and says why", () => {
    const hook = hookValue();
    mockUseGoalSpaces.mockReturnValue(hook);
    const toastError = vi.spyOn(toast, "error");
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Hitler" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));

    expect(hook.createCircle).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(OBJECTIONABLE_NAME_MESSAGE);
    expect(screen.getByLabelText(/circle name/i)).toHaveValue("Hitler");
    toastError.mockRestore();
  });

  it("shares a short code bare + grouped (K7P49M2H → K7P4-9M2H), no spaceId", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        createCircle: vi.fn(async () => ({
          spaceId: "new-space",
          inviteCode: "K7P49M2H",
          inviteCodeExpiresAt: fresh(),
        })),
      })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Autumn block" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));

    await waitFor(() =>
      expect(screen.getByText("Your circle is ready")).toBeInTheDocument()
    );
    // Short code shows grouped and WITHOUT the spaceId prefix.
    expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
    expect(screen.queryByText(/new-space\./)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("K7P4-9M2H")
    );
    // Together pass: the start and the invite are what the page is
    // judged by, so both are counted.
    expect(trackSocial).toHaveBeenCalledWith("circle_created", {
      circleType: "strength_block",
    });
    await waitFor(() =>
      expect(trackSocial).toHaveBeenCalledWith("circle_invite_sent", {
        inviteMethod: "copy",
      })
    );
  });
});

describe("one-member featured circle", () => {
  it("leads with Invite someone (owner) and opens the hand-off with that circle's code", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c1", "Solo Circle", 1, "code-1")] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Your Circle is ready — invite someone/i)
    ).toBeInTheDocument();
    const invite = screen.getByRole("button", { name: /invite someone/i });
    // The focus action moves to the detail sheet for a solo circle.
    expect(
      screen.queryByRole("button", { name: /set weekly focus/i })
    ).toBeNull();

    fireEvent.click(invite);
    await waitFor(() =>
      expect(screen.getByText("c1.code-1")).toBeInTheDocument()
    );
  });

  it("multi-member circles keep the focus button; a non-owner solo member falls back to it", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c2", "Full Circle", 3, "code-2")] })
    );
    const { unmount } = render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: /set weekly focus/i })
    ).toBeInTheDocument();
    unmount();

    // Solo but NOT the owner: no inviteCode on the summary.
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c3", "Orphan Circle", 1, null)] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole("button", { name: /invite someone/i })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /set weekly focus/i })
    ).toBeInTheDocument();
  });
});

describe("a full circle stops offering an invite", () => {
  /* The server refuses a join into a full circle with "circle full", so
     a code sent from an 8-of-8 circle can only fail — and the failure
     lands on the invitee, who did nothing wrong and cannot see why. The
     sheet offered the button at any size, and the only signal was the
     header's "8 of 8 members". */
  async function openDetail(memberCount: number) {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        circles: [summary("c1", "Autumn Crew", memberCount, "K7P4-9M2H")],
      })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Autumn Crew/ }));
    // Anchored on the sheet itself rather than on its member line: the
    // card behind it renders a member count too, so a text anchor
    // matches twice.
    await screen.findByRole("dialog");
  }

  it("says the circle is full and withholds the code", async () => {
    await openDetail(8);
    expect(screen.getByText("8 members · full")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy invite code/i })
    ).toBeNull();
    expect(
      screen.getByText(/Nobody else can join until someone leaves/)
    ).toBeInTheDocument();
  });

  it("still offers the code with one place left", async () => {
    await openDetail(7);
    expect(screen.getByText("7 members")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy invite code/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nobody else can join/)).toBeNull();
  });
});

describe("the circle's own actions", () => {
  /* jsdom lays nothing out, so the wrap is read off the classes. Three
     buttons shared a row that could not wrap, each with a floor of its
     longest word, and at large text "Need a nudge" ran off the sheet
     (17 px at 393 px and 200%, 90 px at 320 px). Each button's floor is
     now its one-line width, and the row wraps when the three do not fit. */
  it("wrap to another row rather than run off the sheet", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        circles: [summary("c1", "Autumn Crew", 3, "K7P49M2H")],
      })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Autumn Crew/ }));
    const sheet = await screen.findByRole("dialog");
    const nudge = await within(sheet).findByRole("button", {
      name: "Need a nudge",
    });
    const row = nudge.parentElement!;
    expect(row).toHaveClass("flex-wrap");
    for (const name of ["Weekly focus", "Milestone", "Need a nudge"]) {
      expect(within(row).getByRole("button", { name })).toHaveClass(
        "min-w-fit",
        "flex-1"
      );
    }
  });
});

describe("an invite code expires", () => {
  /* The server refuses a code seven days after it is made, and the owner
     can replace one at any time. So where the code is shown, the owner is
     told when it stops working, and an expired one is replaced rather
     than sent. */
  const WORKS_UNTIL = /^Works until \d\d:\d\d on \w{3} \d{1,2} \w{3}$/;

  it("the hand-off says when the code stops working", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Autumn block" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));
    await waitFor(() =>
      expect(screen.getByText("Your circle is ready")).toBeInTheDocument()
    );
    expect(screen.getByText(WORKS_UNTIL)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /share invite/i })
    ).toBeInTheDocument();
  });

  it("an expired code is not shown or sent; a new one takes its place", async () => {
    const hook = hookValue({
      circles: [summary("c1", "Solo Circle", 1, "K7P49M2H", Date.now() - 1)],
    });
    mockUseGoalSpaces.mockReturnValue(hook);
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /invite someone/i }));
    await screen.findByText("This code has expired.");
    expect(screen.queryByText("K7P4-9M2H")).toBeNull();
    expect(screen.queryByRole("button", { name: /share invite/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy code/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /make a new code/i }));
    await screen.findByText("NEWC-0DE3");
    expect(hook.renewInviteCode).toHaveBeenCalledWith("c1");
    expect(screen.getByText(WORKS_UNTIL)).toBeInTheDocument();
    expect(screen.queryByText("This code has expired.")).toBeNull();
    expect(
      screen.getByRole("button", { name: /share invite/i })
    ).toBeInTheDocument();
  });

  it("the owner can replace a live code from the circle's sheet", async () => {
    const hook = hookValue({
      circles: [summary("c1", "Autumn Crew", 3, "K7P49M2H")],
    });
    mockUseGoalSpaces.mockReturnValue(hook);
    const toastSuccess = vi.spyOn(toast, "success");
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Autumn Crew/ }));
    await screen.findByRole("dialog");
    expect(await screen.findByText(WORKS_UNTIL)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New code" }));
    await waitFor(() =>
      expect(hook.renewInviteCode).toHaveBeenCalledWith("c1")
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "New invite code. The old one no longer works."
      )
    );
    toastSuccess.mockRestore();
  });

  it("an expired code in the circle's sheet offers only a new one", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        circles: [summary("c1", "Autumn Crew", 3, "K7P49M2H", Date.now() - 1)],
      })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Autumn Crew/ }));
    await screen.findByRole("dialog");
    expect(
      await screen.findByText("This code has expired.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy invite code/i })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /make a new code/i })
    ).toBeInTheDocument();
  });
});

/* The word filter as a session that has used it holds it: loaded, so the
   sheet draws on its first render (useWordFilter covers the wait). */
beforeAll(async () => {
  await loadWordFilter();
});
