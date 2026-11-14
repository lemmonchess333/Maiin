import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const social = require("../lib/socialPush");
const { withNativePushAlert } = require("../lib/pushSend");

const at = (iso) => ({ toMillis: () => Date.parse(iso) });

describe("pushes from people (App1 Q18)", () => {
  it("are comments, follow requests both ways, an invite joined and a league result", () => {
    expect([...social.SOCIAL_PUSH_TYPES]).toEqual([
      "comment",
      "space_post_comment",
      "follow_request",
      "follow_accepted",
      "invite_joined",
      "league_result",
    ]);
    for (const type of ["kudos", "follow", "space_post_like", "circle_joined"])
      expect(
        social.socialPushMessage({ type, message: "Maya did a thing" })
      ).toBeNull();
  });

  it("say the row's own sentence and open what it is about", () => {
    expect(
      social.socialPushMessage({
        type: "comment",
        activityId: "act_1",
        fromUserId: "maya",
        message: "Maya commented on your activity",
      })
    ).toEqual({
      data: {
        type: "social",
        kind: "comment",
        route: "/activity/act_1?comments=1",
        title: "New comment",
        body: "Maya commented on your activity",
      },
    });
    expect(
      social.socialPushRoute({
        type: "space_post_comment",
        spaceId: "runners",
        postId: "p1",
      })
    ).toBe("/space/runners/post/p1?comments=1");
    expect(
      social.socialPushRoute({ type: "follow_request", fromUserId: "maya" })
    ).toBe("/user/maya");
    expect(social.socialPushRoute({ type: "league_result" })).toBe("/league");
    // An id that is not a plain id opens Social, never a path built from it.
    expect(
      social.socialPushRoute({ type: "comment", activityId: "../x" })
    ).toBe("/social");
  });

  it("push only a new notice: a create, or a new createdAt under the same id", () => {
    const first = { createdAt: at("2026-11-14T10:00:00Z") };
    expect(social.isNewNotice(null, first)).toBe(true);
    expect(social.isNewNotice(first, { ...first, read: true })).toBe(false);
    expect(
      social.isNewNotice(first, { createdAt: at("2026-11-15T10:00:00Z") })
    ).toBe(true);
    expect(social.isNewNotice(first, null)).toBe(false);
  });

  it("arrive quietly in quiet hours: no sound, passive, silent on the web", () => {
    const full = withNativePushAlert(
      social.socialPushMessage({ type: "league_result", message: "x" }),
      "u1"
    );
    const quiet = social.quietly(full);
    expect(quiet.apns.payload.aps.sound).toBeUndefined();
    expect(quiet.apns.payload.aps["interruption-level"]).toBe("passive");
    expect(quiet.data.silent).toBe("1");
    expect(full.apns.payload.aps.sound).toBe("default");
    expect(
      social.quietNow(new Date("2026-11-14T23:30:00Z"), "Europe/London")
    ).toBe(true);
    expect(
      social.quietNow(new Date("2026-11-14T12:00:00Z"), "Europe/London")
    ).toBe(false);
    expect(social.quietNow(new Date(), null)).toBe(true);
  });
});

describe("the props bundle", () => {
  it("is due at the next 19:00 in the person's time zone", () => {
    expect(
      social
        .propsBundleDueAt(new Date("2026-11-14T08:10:00Z"), "Europe/London")
        .toISOString()
    ).toBe("2026-11-14T19:00:00.000Z");
    // After 19:00, tomorrow's.
    expect(
      social
        .propsBundleDueAt(new Date("2026-11-14T19:05:00Z"), "Europe/London")
        .toISOString()
    ).toBe("2026-11-15T19:00:00.000Z");
    // New York in November is UTC-5.
    expect(
      social
        .propsBundleDueAt(new Date("2026-11-14T12:00:00Z"), "America/New_York")
        .toISOString()
    ).toBe("2026-11-15T00:00:00.000Z");
    expect(social.propsBundleDueAt(new Date(), null)).toBeNull();
  });

  it("names one person, and counts more", () => {
    let entries = social.withProps(null, {
      from: "maya",
      activityId: "a1",
      name: "Maya",
    });
    expect(social.propsBundleMessage(entries).data).toMatchObject({
      kind: "kudos",
      title: "Props",
      body: "Maya gave you props",
      route: "/activity/a1",
    });
    entries = social.withProps({ entries }, { from: "sam", activityId: "a1" });
    entries = social.withProps({ entries }, { from: "jo", activityId: "a1" });
    // Props again from the same person on the same session: once.
    entries = social.withProps({ entries }, { from: "jo", activityId: "a1" });
    expect(
      social.propsBundleMessage(entries, { sessionTypes: { a1: "run" } }).data
        .body
    ).toBe("3 people gave props to your run");
    entries = social.withProps({ entries }, { from: "jo", activityId: "a2" });
    expect(social.propsBundleMessage(entries).data).toMatchObject({
      body: "3 people gave props to your sessions",
      route: "/social",
    });
    expect(
      social.withoutProps({ entries }, { from: "jo", activityId: "a2" })
    ).toHaveLength(3);
    expect(social.propsBundleMessage([])).toBeNull();
  });
});
