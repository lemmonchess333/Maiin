/**
 * The segment maker (Run26 call 3): the stretch's length and the refusal
 * before asking, Save only for a stretch and a name that can be sent, the
 * request the createSegment callable gets, and the server's refusal in its
 * own words. The callable is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import type { GPSPoint } from "@/lib/gps";
import type { PointRange } from "@/lib/segments";

const H = vi.hoisted(() => ({
  call: vi.fn(),
  restrictedToast: vi.fn(),
  needsVerification: false,
  restricted: false,
}));

vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { uid: "me" } }) }));
vi.mock("@/hooks/useEmailVerificationGate", () => ({
  useEmailVerificationGate: () => ({
    needsVerification: H.needsVerification,
    recheck: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: H.restricted }),
}));
vi.mock("@/lib/accountRestriction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/accountRestriction")>()),
  showRestrictedToast: H.restrictedToast,
}));

import SegmentMaker from "../SegmentMaker";

/** 20 points 100 m apart, east of a spot in south London. */
const POINTS: GPSPoint[] = Array.from({ length: 20 }, (_, i) => {
  const lat = 51.4433;
  const lon =
    -0.1517 +
    (i * 100) / ((Math.PI / 180) * 6371000 * Math.cos((lat * Math.PI) / 180));
  return {
    lat,
    lon,
    rawLat: lat,
    rawLon: lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: i * 25_000,
  };
});

const made = vi.fn();

function Harness({ initial }: { initial: PointRange }) {
  const [range, setRange] = useState(initial);
  return (
    <SegmentMaker
      runId="run-1"
      points={POINTS}
      range={range}
      onRangeChange={setRange}
      unit="km"
      onCancel={() => {}}
      onMade={made}
    />
  );
}

beforeEach(() => {
  H.needsVerification = false;
  H.restricted = false;
  H.call.mockReset();
  H.restrictedToast.mockReset();
  made.mockReset();
});
afterEach(() => cleanup());

const save = () => screen.getByRole("button", { name: "Save segment" });
const name = (value: string) =>
  fireEvent.change(screen.getByLabelText("Name"), { target: { value } });

describe("SegmentMaker", () => {
  it("shows the stretch's length, and sends the stretch and the name", async () => {
    H.call.mockResolvedValue({ data: { segmentId: "seg-9" } });
    render(<Harness initial={{ from: 2, to: 13 }} />);
    expect(screen.getByText("Length").parentElement).toHaveTextContent(
      "Length 1.1 km"
    );
    // A name is needed before Save.
    expect(save()).toBeDisabled();
    name("  Common   straight ");
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(made).toHaveBeenCalledWith("seg-9"));
    expect(H.call).toHaveBeenCalledWith("createSegment", {
      runId: "run-1",
      startIndex: 2,
      endIndex: 13,
      name: "Common straight",
    });
  });

  it("refuses a stretch under 400 m before asking", () => {
    render(<Harness initial={{ from: 2, to: 5 }} />);
    name("Short");
    expect(
      screen.getByText("A segment needs to be at least 400 m.")
    ).toBeVisible();
    expect(save()).toBeDisabled();
    expect(H.call).not.toHaveBeenCalled();
  });

  it("moves the ends with the sliders, never one past the other", () => {
    render(<Harness initial={{ from: 2, to: 12 }} />);
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "15" },
    });
    expect(screen.getByLabelText("Start")).toHaveValue("11");
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "0" } });
    expect(screen.getByLabelText("End")).toHaveValue("12");
  });

  it("shows the server's refusal in its own words", async () => {
    H.call.mockRejectedValue({
      code: "functions/failed-precondition",
      message: "A segment can’t pass through one of your privacy zones.",
    });
    render(<Harness initial={{ from: 2, to: 12 }} />);
    name("Past home");
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A segment can’t pass through one of your privacy zones."
    );
    expect(made).not.toHaveBeenCalled();
  });

  it("tells a restricted account why, with the way to support", async () => {
    H.call.mockRejectedValue({
      code: "functions/permission-denied",
      message: "Your account is restricted",
      details: { reason: "account-restricted" },
    });
    render(<Harness initial={{ from: 2, to: 12 }} />);
    name("Mine");
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t save the segment. Try again."
    );
    expect(H.restrictedToast).toHaveBeenCalledTimes(1);
  });

  it("holds Save for an unverified email, and says why where Save is", () => {
    H.needsVerification = true;
    render(<Harness initial={{ from: 2, to: 13 }} />);
    name("Common straight");
    expect(
      screen.getByText(/Verify your email to make a segment/)
    ).toBeVisible();
    expect(save()).toBeDisabled();
  });

  it("holds Save for a restricted account, with the way to support", () => {
    H.restricted = true;
    render(<Harness initial={{ from: 2, to: 13 }} />);
    name("Common straight");
    expect(screen.getByRole("link", { name: "Contact support" })).toBeVisible();
    expect(save()).toBeDisabled();
  });
});
