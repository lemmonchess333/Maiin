/**
 * The weekly review's offers for the week ahead (App1 Q36): which show,
 * in what order, in what words, and which Q5 lets the person undo.
 */
import { describe, expect, it } from "vitest";
import { reviewWeekOffers, type WeekOffersInput } from "../reviewWeekOffers";

const NOTHING: WeekOffersInput = {
  fellBehind: null,
  recentLayoff: "none",
  raceCheck: null,
  lighterWeek: null,
  paces: null,
  unit: "km",
};

const offers = (input: Partial<WeekOffersInput>) =>
  reviewWeekOffers({ ...NOTHING, ...input });

describe("reviewWeekOffers", () => {
  it("offers nothing when nothing is offered elsewhere", () => {
    expect(offers({})).toEqual([]);
  });

  it("the weekly check's prompt: realign, with the race's date one tap away", () => {
    const [offer] = offers({
      fellBehind: { realRunCount: 1, weeklyTarget: 4 },
    });
    expect(offer).toMatchObject({
      kind: "fell-behind",
      sport: "run",
      title: "Last week didn’t go to plan",
      acceptLabel: "Realign my plan",
      route: { label: "My race moved", to: "/settings/run-plan" },
      routeFirst: false,
      undoable: false,
      doneLine: null,
    });
    expect(offer.reason).toBe(
      "You ran 1 of 4 planned runs. Realigning keeps your race date and plans from today."
    );
  });

  it("after a long break the same prompt is a rebuild, without the count", () => {
    const [offer] = offers({
      fellBehind: { realRunCount: 0, weeklyTarget: 3 },
      recentLayoff: "detrained",
    });
    expect(offer).toMatchObject({
      kind: "fell-behind",
      title: "Welcome back",
      acceptLabel: "Rebuild my plan",
    });
    expect(offer.reason).not.toMatch(/0 of 3/);
  });

  it("the race check leads with moving the race, and says each distance", () => {
    const [offer] = offers({
      raceCheck: { longestKm: 8, reachKm: 14, raceKm: 21.1, distance: "half" },
    });
    expect(offer).toMatchObject({
      kind: "race-check",
      title: "Your long runs and your race",
      route: { label: "Move my race", to: "/settings/run-plan" },
      routeFirst: true,
      acceptLabel: "Realign my plan",
    });
    expect(offer.reason).toBe(
      "Your longest run in four weeks is 8 km. By the taper it reaches about 14 km."
    );
    expect(offer.change).toBe(
      "A half marathon is 21.1 km. Moving the race gives you time to build up to it."
    );
  });

  it("says the race check's distances in miles for a reader in miles", () => {
    const [offer] = offers({
      unit: "mi",
      raceCheck: { longestKm: 8, reachKm: 14, raceKm: 21.1, distance: "half" },
    });
    expect(offer.reason).toBe(
      "Your longest run in four weeks is 5 mi. By the taper it reaches about 8.7 mi."
    );
  });

  it("the weekly check's prompt speaks before the race check, never both", () => {
    const list = offers({
      fellBehind: { realRunCount: 1, weeklyTarget: 4 },
      raceCheck: { longestKm: 8, reachKm: 14, raceKm: 21.1, distance: "half" },
    });
    expect(list.map((o) => o.kind)).toEqual(["fell-behind"]);
  });

  it("a lighter week says what it changes in both sports, and can be undone", () => {
    const [offer] = offers({
      lighterWeek: { why: null, liftSessions: 3, runsEased: 2 },
    });
    expect(offer).toMatchObject({
      kind: "lighter-week",
      sport: null,
      acceptLabel: "Take a lighter week",
      undoable: true,
    });
    expect(offer.change).toBe(
      "Half the sets at the same weights, and 2 runs a step shorter. The full plan is back next week."
    );
    expect(offer.doneLine).toBe(
      "This week is a lighter one. The full plan is back next week."
    );
  });

  it("says why in Train's words when Train's decision gives them", () => {
    const why = "You ran 30% more than your usual week.";
    const [offer] = offers({
      lighterWeek: { why, liftSessions: 3, runsEased: 0 },
    });
    expect(offer.reason).toBe(why);
  });

  it("without Train's words, claims no reason the engine may not have had", () => {
    const [offer] = offers({
      lighterWeek: { why: null, liftSessions: 3, runsEased: 0 },
    });
    expect(offer.reason).toBe("Your last 7 days point to a lighter week.");
  });

  it("a lighter week for a runner alone names only the runs", () => {
    const [offer] = offers({
      lighterWeek: { why: null, liftSessions: 0, runsEased: 1 },
    });
    expect(offer.change).toBe(
      "1 run a step shorter. The full plan is back next week."
    );
  });

  it("a lighter week for a lifter alone names only the sets", () => {
    const [offer] = offers({
      lighterWeek: { why: null, liftSessions: 2, runsEased: 0 },
    });
    expect(offer.change).toBe(
      "Half the sets, at the same weights. The full plan is back next week."
    );
  });

  it("offers no lighter week that would change nothing", () => {
    expect(
      offers({ lighterWeek: { why: null, liftSessions: 0, runsEased: 0 } })
    ).toEqual([]);
  });

  it("new paces give the easy pace before and after, and take no undo", () => {
    const [offer] = offers({
      paces: { direction: "faster", currentVdot: 40, suggestedVdot: 44 },
    });
    expect(offer).toMatchObject({
      kind: "paces",
      title: "Faster paces",
      acceptLabel: "Update paces",
      undoable: false,
      doneLine: "Training paces updated.",
    });
    expect(offer.change).toMatch(
      /^Easy runs become \d:\d\d–\d:\d\d \/km, from \d:\d\d–\d:\d\d \/km\.$/
    );
  });

  it("slower paces are easier paces", () => {
    const [offer] = offers({
      paces: { direction: "slower", currentVdot: 44, suggestedVdot: 40 },
    });
    expect(offer.title).toBe("Easier paces");
  });

  it("a runner's first paces say what easy runs become, with nothing to move from", () => {
    const [offer] = offers({
      paces: { direction: "first", currentVdot: 0, suggestedVdot: 42 },
    });
    expect(offer).toMatchObject({
      kind: "paces",
      title: "Your training paces",
      acceptLabel: "Set paces",
      undoable: false,
      doneLine: "Training paces set.",
    });
    expect(offer.change).toMatch(/^Easy runs become \d:\d\d–\d:\d\d \/km\.$/);
  });

  it("orders the race plan first, then the week's load, then the paces", () => {
    const list = offers({
      paces: { direction: "faster", currentVdot: 40, suggestedVdot: 44 },
      lighterWeek: { why: null, liftSessions: 3, runsEased: 2 },
      raceCheck: { longestKm: 8, reachKm: 14, raceKm: 21.1, distance: "half" },
    });
    expect(list.map((o) => o.kind)).toEqual([
      "race-check",
      "lighter-week",
      "paces",
    ]);
  });

  it("keeps its words in the house voice", () => {
    const list = offers({
      fellBehind: { realRunCount: 1, weeklyTarget: 4 },
      lighterWeek: { why: null, liftSessions: 3, runsEased: 2 },
      paces: { direction: "faster", currentVdot: 40, suggestedVdot: 44 },
    });
    for (const offer of list) {
      const words = [
        offer.title,
        offer.reason,
        offer.change,
        offer.acceptLabel,
        offer.route?.label,
        offer.doneLine,
      ]
        .filter(Boolean)
        .join(" ");
      expect(words).not.toMatch(/[—!']/);
      expect(offer.acceptLabel.length).toBeLessThanOrEqual(20);
    }
  });
});
