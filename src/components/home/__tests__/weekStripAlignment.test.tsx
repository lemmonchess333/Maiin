/**
 * The week strip is three stacked rows — letter, date, indicator — and they
 * only read as a row while every cell shares their baselines.
 *
 * Today used to render at `size-12` against its neighbours' `size-10`. In a
 * `flex-col items-center` cell, a circle 8px taller pushes its own weekday
 * letter up and its indicator dot down, so the one day a user looks at most
 * was the one day that broke all three lines. iOS marks today with colour
 * and never with geometry, which is why its week rows stay ruled.
 *
 * The second defect is in the same family: selection and today were an
 * if/else, so selecting today — the likeliest day to select — erased the
 * today marker and left it identical to any other selected day.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WeekStrip from "@/components/home/WeekStrip";
import type { UserProfile } from "@/lib/auth";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString } from "@/lib/dateHelpers";

const emptyClaimMap: Map<string, ClaimState> = new Map();
const profile = { uid: "u1" } as UserProfile;
const todayKey = localDateString(new Date());

function renderStrip(selectedDate: string | null = null) {
  return render(
    <WeekStrip
      dayMap={new Map()}
      profile={profile}
      programState={null}
      claimMap={emptyClaimMap}
      selectedDate={selectedDate}
      onDayTap={vi.fn()}
    />
  );
}

/** The date circle inside each of the seven day buttons. */
function circles(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).map(
    (b) => b.querySelector("div.rounded-full") as HTMLElement
  );
}

describe("week strip geometry", () => {
  it("gives every day the same circle size", () => {
    const { container } = renderStrip();
    const sizes = circles(container).map((c) =>
      Array.from(c.classList).find((n) => n.startsWith("size-"))
    );
    expect(sizes).toHaveLength(7);
    expect(new Set(sizes).size).toBe(1);
  });

  it("marks today without resizing it", () => {
    const { container } = renderStrip();
    const today = circles(container).find((c) =>
      c.className.includes("ring-primary")
    );
    expect(today).toBeTruthy();
    expect(today!.className).not.toMatch(/size-12/);
  });
});

describe("today and selected compose", () => {
  it("keeps the today ring when today is the selected day", () => {
    const { container } = renderStrip(todayKey);
    const selected = circles(container).find((c) =>
      c.className.includes("bg-primary-strong")
    );
    expect(selected).toBeTruthy();
    // Fill says selected; the ring has to survive it or the strip stops
    // saying which day is today exactly when you are standing on it.
    expect(selected!.className).toMatch(/ring-primary/);
  });

  it("does not ring a selected day that is not today", () => {
    // The other half — otherwise "always ring the selection" would pass
    // the test above while meaning nothing.
    //
    // The neighbour has to stay INSIDE the rendered week or there is no
    // selected circle to find. The week is Monday-anchored, so yesterday
    // leaves it only on a Monday (getDay() === 1) — that is the one day
    // that has to reach forward instead.
    const other = new Date();
    other.setDate(other.getDate() + (other.getDay() === 1 ? 1 : -1));
    const { container } = renderStrip(localDateString(other));
    const selected = circles(container).find((c) =>
      c.className.includes("bg-primary-strong")
    );
    expect(selected).toBeTruthy();
    expect(selected!.className).not.toMatch(/ring-primary/);
  });
});

describe("weekday letters", () => {
  it("renders one letter per day", () => {
    // The row is a fixed frame — always the calendar week — so position
    // disambiguates the two S's and the two T's, as on the iOS week row.
    // Monday-anchored (`WEEK_STARTS_ON = 1`), so the pair of S's is at the
    // END: Saturday then Sunday.
    const { container } = renderStrip();
    const letters = Array.from(container.querySelectorAll("button")).map(
      (b) => b.querySelector("span")?.textContent ?? ""
    );
    expect(letters).toHaveLength(7);
    for (const l of letters) expect(l).toHaveLength(1);
    expect(letters.join("")).toBe("MTWTFSS");
  });
});
