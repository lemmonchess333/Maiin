import { describe, expect, it } from "vitest";
import {
  droppedRaceNotice,
  raceLinkAfterDistance,
  type RaceLinkState,
} from "../raceLink";

const DATE = "2027-10-10";
const BOURNEMOUTH: RaceLinkState = {
  link: {
    name: "Bournemouth Half Marathon",
    spaceId: "race-bournemouth-half",
    distance: "half",
  },
  dropped: null,
};

describe("raceLinkAfterDistance", () => {
  it("takes a race off the plan when the distance is no longer the race's", () => {
    // The owner's recording: Ultra 50K kept "Bournemouth Half Marathon".
    const next = raceLinkAfterDistance(BOURNEMOUTH, "50k", DATE);
    expect(next.link).toEqual({ name: "", spaceId: "", distance: "50k" });
    expect(next.dropped).toEqual({ ...BOURNEMOUTH.link, date: DATE });
  });

  it("takes off a typed name too, with no catalogue race behind it", () => {
    const typed: RaceLinkState = {
      link: { name: "Club 10K", spaceId: "", distance: "10k" },
      dropped: null,
    };
    const next = raceLinkAfterDistance(typed, "5k", DATE);
    expect(next.link.name).toBe("");
    expect(next.dropped?.name).toBe("Club 10K");
  });

  it("puts the race back on a return to its distance", () => {
    const away = raceLinkAfterDistance(BOURNEMOUTH, "50k", DATE);
    const back = raceLinkAfterDistance(away, "half", DATE);
    expect(back).toEqual({ link: BOURNEMOUTH.link, dropped: null });
  });

  it("puts the name back but not the binding once the date has moved", () => {
    const away = raceLinkAfterDistance(BOURNEMOUTH, "50k", DATE);
    const back = raceLinkAfterDistance(away, "half", "2027-11-01");
    expect(back.link).toEqual({
      name: "Bournemouth Half Marathon",
      spaceId: "",
      distance: "half",
    });
  });

  it("brings no race back over a name given since, and leaves a plan with no race alone", () => {
    const away = raceLinkAfterDistance(BOURNEMOUTH, "50k", DATE);
    const named: RaceLinkState = {
      ...away,
      link: { ...away.link, name: "Bath Beat" },
    };
    const later = raceLinkAfterDistance(named, "half", DATE);
    expect(later.link.name).toBe("");
    expect(later.dropped?.name).toBe("Bath Beat");
    const none: RaceLinkState = {
      link: { name: "", spaceId: "", distance: "10k" },
      dropped: null,
    };
    expect(raceLinkAfterDistance(none, "half", DATE)).toEqual({
      link: { name: "", spaceId: "", distance: "half" },
      dropped: null,
    });
  });
});

describe("droppedRaceNotice", () => {
  it("names the race and its distance, and points at the date", () => {
    const away = raceLinkAfterDistance(BOURNEMOUTH, "50k", DATE);
    expect(droppedRaceNotice(away.dropped)).toBe(
      "Bournemouth Half Marathon is a half marathon, so it’s no longer this plan’s race. Check the date below."
    );
  });

  it("says nothing when no name was taken off", () => {
    expect(droppedRaceNotice(null)).toBeNull();
    expect(
      droppedRaceNotice({
        name: "",
        spaceId: "race-x",
        distance: "10k",
        date: DATE,
      })
    ).toBeNull();
  });
});
