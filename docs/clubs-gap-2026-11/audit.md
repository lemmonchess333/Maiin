# Clubs are Spaces and Circles: the gap to Strava's clubs (Run26 call 4)

The Run26 lock (call 4, owner-delegated, 14 November 2026) says there is no
third kind of group in Tropos: Strava's clubs are measured against what
Spaces and Circles already do, the largest gap is built, and the rest is
listed. This is that audit.

Spaces, Circles and the league are locked designs and outrank Strava parity:
Spc1a (Spaces are made by Tropos only, so S1's refusal of user-made public
communities stands), GsPb1 (Circles are invite-only, two to eight people,
and keep photos, calories, bodyweight and GPS out), and Trim1 call 3(a)
(Social has one weekly ranking, the league; the friends board went on
12 November). Where a Strava feature runs into one of them, the row says so.

## What Strava's clubs do, checked

Each Strava row comes from Strava's own support pages, read on 14 November
2026:

- [Clubs on Strava](https://support.strava.com/en-us/articles/15402172-clubs-on-strava)
- [Clubs on the mobile app](https://support.strava.com/en-us/articles/15401837-clubs-on-the-mobile-app)
- [How do I create and manage group events for my club](https://support.strava.com/en-us/articles/15401898-how-do-i-create-and-manage-group-events-for-my-club)
- [Why aren't my activities counting towards a club leaderboard](https://support.strava.com/hc/en-us/articles/360017705031-Why-aren-t-my-activities-counting-towards-a-Club-leaderboard)
- [How do group challenges work on Strava](https://support.strava.com/en-us/articles/15401736-how-do-group-challenges-work-on-strava)

## Feature by feature

**Has it**: Tropos does the job. **Partly**: some of it, the row says what
is missing. **Missing**: nothing does it. Strava's detail is what the pages
above say; nothing here is from memory.

| #   | Strava's clubs                                                                                                                                                                                                                                                                    | Tropos                                                                                                                                                                                                                                                                                                                        | Status                        | Where in Tropos                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Anyone creates a club: sport, up to three tags, logo, name, description, privacy, location. The creator is its owner.                                                                                                                                                             | Anyone starts a Circle (a goal, a name, an optional end date) and owns it; invite-only, two to eight people. Spaces are made by Tropos only (Spc1a).                                                                                                                                                                          | Partly                        | `src/components/social/CirclesSection.tsx` (Start a circle), `functions/lib/goalSpaceMembership.js`, `src/features/spaces/spaceDefs.ts`                                  |
| 2   | A public club anyone joins with Join Club.                                                                                                                                                                                                                                        | A Space: Join, and Leave behind a confirmation.                                                                                                                                                                                                                                                                               | Has it                        | `src/features/spaces/useSpaceMembership.ts`, `src/pages/Space.tsx`                                                                                                       |
| 3   | A private club: you request to join and an admin approves ("Pending").                                                                                                                                                                                                            | A Circle's invite code is the approval: whoever holds it joins. A code lasts seven days and the owner renews it. No request queue.                                                                                                                                                                                            | Partly                        | `functions/lib/goalSpaceMembership.js` (`joinGoalSpace`), `src/features/goalSpace/inviteCode.ts`                                                                         |
| 4   | Find clubs by keyword, location, sport and type.                                                                                                                                                                                                                                  | The Spaces directory, with race distance chips and a country sheet. No search by name. Circles are never listed (GsPb1).                                                                                                                                                                                                      | Partly                        | `src/features/spaces/SpacesDirectory.tsx`, `src/features/spaces/RaceFilterChips.tsx`                                                                                     |
| 5   | Owner and admins: approve requests, promote, remove members, edit details and photos, delete the club, transfer ownership.                                                                                                                                                        | A Circle's owner removes members, makes a new code and continues or wraps the Circle. No admins, no rename, no transfer: the owner leaving ends it. Spaces have Tropos Team officials who pin posts.                                                                                                                          | Partly                        | `functions/lib/goalSpaceMembership.js`, `functions/lib/goalSpaceLifecycle.js`, `firestore.rules` (`officialUids`)                                                        |
| 6   | A members list with each one's role, and Invite from it. Large clubs list only the members you follow.                                                                                                                                                                            | A Circle's sheet lists its members, the owner marked. A Space shows its member count from 3, and no list.                                                                                                                                                                                                                     | Partly                        | `src/components/social/CirclesSection.tsx` (detail sheet), `src/features/spaces/spaceHeroMeta.ts`                                                                        |
| 7   | Recent Activity: members' activities of the club's sport, automatically. "Only You" activities are left out.                                                                                                                                                                      | Space posts are chosen shares with a session attached, and the Feed merges the posts of joined Spaces. A Circle gets a session only when its member shares it, with no numbers (CIRCLE-SESSION-01).                                                                                                                           | Partly                        | `src/features/spaces/SpacePostComposer.tsx`, `src/features/spaces/useCommunitiesFeed.ts`, `src/components/social/CircleShareSheet.tsx`                                   |
| 8   | A weekly leaderboard: this week and last, by distance (one sport) or time (multisport), top 10 in the app plus the two above and below you, reset at 23:59 on Sunday; last week's podium.                                                                                         | None for a Space or a Circle. Social's one weekly ranking is the league: groups of about 20, scored against each person's own plan.                                                                                                                                                                                           | Missing, by lock (Trim1 3(a)) | `src/features/league/`                                                                                                                                                   |
| 9   | Weekly stats: a scatterplot, the week's totals and its top performer (clubs of 500 or fewer).                                                                                                                                                                                     | A Space's hero says how many posts it had this week; a Circle says how many members set a focus. No training totals.                                                                                                                                                                                                          | Missing                       | `src/features/spaces/spaceHeroMeta.ts`, `src/features/goalSpace/weeklyFocus.ts`                                                                                          |
| 10  | Discussion posts and replies.                                                                                                                                                                                                                                                     | Space posts (title, words, photos, a session), comments, props, report and block.                                                                                                                                                                                                                                             | Has it                        | `src/pages/Space.tsx`, `src/features/spaces/SpacePostCard.tsx`, `src/features/spaces/SpaceCommentSheet.tsx`                                                              |
| 11  | A notification when a new post goes up in your club, and when someone replies in a thread you posted in.                                                                                                                                                                          | Your own post's props and comments notify you. A new post in a Space you joined does not.                                                                                                                                                                                                                                     | Partly                        | `functions/lib/spacePostEngagement.js`                                                                                                                                   |
| 12  | Group events: admins and owners create them; date, time and location required; type (social, workout, competition); up to four pace groups; a route; terrain; Join Event; an optional cap; a discussion; a reminder 24 hours before; repeat; discoverable or not; edit or cancel. | **Built in this PR, in Circles:** any member plans a meet-up (run or lift, a name, a day and a time, a typed place, a note); members say they're in or can't make it; the organiser or the owner calls it off; the others are told. Not built: route, pace groups, cap, discussion, reminder, repeat, and meet-ups in Spaces. | Partly (was missing)          | `src/features/goalSpace/circleMeetups.ts`, `src/components/social/CircleMeetupList.tsx`, `src/components/social/CircleMeetupSheet.tsx`, `functions/lib/circleMeetups.js` |
| 13  | Share a club by social media, email or text.                                                                                                                                                                                                                                      | A Circle's owner shares its invite. A Space has no share.                                                                                                                                                                                                                                                                     | Partly                        | `src/components/social/CirclesSection.tsx` (`shareInvite`)                                                                                                               |
| 14  | Invite someone (both must follow each other) or send the club's link.                                                                                                                                                                                                             | Circle invite codes, and the app's invite links (Soc15).                                                                                                                                                                                                                                                                      | Has it                        | `functions/lib/goalSpaceMembership.js`, `functions/lib/inviteCodes.js`                                                                                                   |
| 15  | Notification settings, one set for every club.                                                                                                                                                                                                                                    | Settings → Notifications has a Circles switch and a Spaces switch.                                                                                                                                                                                                                                                            | Has it                        | `src/lib/notificationPreferences.ts`                                                                                                                                     |
| 16  | Choose which club shows on your profile.                                                                                                                                                                                                                                          | A race you are training for can show on your profile (opt-in). Other Spaces and Circles cannot.                                                                                                                                                                                                                               | Partly                        | `src/features/spaces/TrainingForChip.tsx`, `src/features/spaces/RaceIdentityToggle.tsx`                                                                                  |
| 17  | Leave a club; an owner first hands ownership on.                                                                                                                                                                                                                                  | Leave a Space; leave a Circle (the owner leaving ends it).                                                                                                                                                                                                                                                                    | Has it                        | `src/pages/Space.tsx`, `functions/lib/goalSpaceMembership.js`                                                                                                            |
| 18  | Group challenges made by members (subscribers): up to 199 followers, most activity, fastest effort, longest activity or a group goal.                                                                                                                                             | Challenges are Tropos's own; the community goal counts everyone's runs. Nobody makes one for their Circle.                                                                                                                                                                                                                    | Missing                       | `functions/lib/challengeDefs.js`, `functions/lib/communityGoal.js`                                                                                                       |

## The piece built: meet-ups in a Circle

Chosen by what a club member uses every week, not by size. The weekly
leaderboard (row 8) is what most Strava members open each week, but a club
board would be a second weekly ranking of other people's weeks, which
Trim1 call 3(a) removed two days before this audit; it is listed below as an
owner call. The next most-used thing a club gives its members is its weekly
group run (row 12), and Tropos had nothing for it at all: no time, no place,
no "I'm in".

It lives in Circles because a Circle is invite-only and at most eight people
(GsPb1), so a time and a place reach only people the organiser invited. In a
public Space the same card would publish where and when named people will
be, to anyone who joins; that is a safety decision for the owner (gap 3).

What a member can do:

- **Plan a meet-up** from the Circle's sheet: Run or Lift, a name, a day and a
  time (this phone's), where to meet, and a note. The words meet the word
  filter in the app and again on the server. Not in an ended Circle, nor in a
  Circle of one its owner can invite to, where it reaches nobody.
- **See what is coming up**: the Circle's sheet lists the meet-ups not yet
  over, soonest first, with who is going ("You, Maya and Sam are going"), and
  the featured Circle's row on Together reads its next one. Each member reads
  the start in their own time zone.
- **Say I'm in, or Can't make it.** Saying you're in is refused across a block
  between you and the organiser, as backing a check-in is, and to a
  restricted account. Saying you can't make it stays open.
- **Call it off**: the organiser or the Circle's owner, after a second tap.
  Everyone who said they were in is told.

How it holds GsPb1 and CLAUDE.md's invariants:

- **Server-written only.** `goalSpaces/{spaceId}/meetups/{meetupId}` is read
  by members and written by no client; the `circleMeetup` callable is the one
  writer, behind the deletion actor-lock, the restriction check (planning and
  I'm in only), a rate limit, and the server word filter.
- **No coordinates, numbers or copied names.** The place is typed words; there
  is no distance, pace or load; names are read from the Circle's member docs,
  which identity resync already keeps current.
- **Time.** Stored as the instant it starts plus the organiser's IANA zone, and
  shown with `formatTimeOfDay` and the en-GB date helpers in each viewer's
  zone (`circleMeetups.test.ts` reads one instant from London, New York and
  Auckland).
- **Gone when it should be.** Called off; its organiser leaving or being
  removed (their meet-ups go, their uid comes off the others' lists); the
  Circle ending (wrap, or the owner leaving); account deletion, in the
  `goal_spaces` step for current Circles and in the social sweep for any
  Circle the account left. Past meet-ups are hidden three hours after their
  start and deleted when the next one is planned; nothing waits on a TTL
  policy.
- **Notices** follow the recipient's Circles switch: `circle_meetup` ("Maya
  planned a group run") to the other members, `circle_meetup_cancelled` to
  those who were in. The row opens Together.

Every number in it is a Tropos heuristic, labelled where it is defined: three
hours shown after the start, two months ahead at most, eight ahead per Circle,
past ones pruned after two days.

- STATUS 2026-11-15: built (Run27 calls 10 and 11). Meet-ups now carry what
  Strava's group events do, still without a pin or a route (GsPb1):
  - **Reminder.** `hourlyMeetupSweep` (functions/index.js, half past each
    hour, one instance) sends `circle_meetup_reminder` about 24 hours before
    the start (Strava: "All RSVP'd athletes will receive an event
    notification 24 hours before the start time of the event", read 15
    November 2026 on "Clubs on the mobile app") to each member still in,
    under the Circles switch, in their own time zone ("Group run on Saturday
    at 08:00. You and 3 others are in."). It is a row and a push (it joins
    App1 Q18's pushes; the reason is in `functions/lib/socialPush.js`). Sent
    once: the meet-up's `remindAt` marks it due and is cleared after the
    sends, and each member's row has a fixed id written with
    `keepExisting`, so a sweep cut off part way and run again adds nothing.
    Never for a meet-up called off (deleted, and re-read before sending),
    never after the start, never in an ended Circle, never across a block
    with the organiser. A meet-up planned less than 30 hours ahead gets no
    reminder (Tropos heuristic: six hours' notice before the reminder would
    go), since everyone has just been told of it.
  - **Repeat weekly**, model (a): the next one is planned when this one is
    over (three hours after its start, when the list drops it), at the same
    time of day in the organiser's zone a week on (the clocks changing
    included), with only the organiser in and no new notice. One at a time,
    so a series takes one of the eight places ahead. It ends when it is
    called off, the organiser leaves, is restricted or is deleting their
    account, the Circle ends, the Circle has eight others ahead, or its
    words meet a filter that now refuses them.
  - **Pace groups:** a run's optional typed field, one line, 80 characters
    (Tropos heuristic: Strava allows four groups), through the word filter
    in the app and on the server. A lift has none.
  - **Rename a Circle** (row 5, rank 11): the owner, while it is live,
    through the `renameGoalSpace` callable, under the rule a new Circle's
    name meets; refused to anyone else and to a restricted account. The
    Together row, the Circle's sheet and a later invite read the new name
    from the Circle; each member's journey link, its one copy, changes in
    the same transaction. No notification carries a Circle's name, and
    identity resync carries people's names only, so nothing else changes.
  - Tests: `functions/__tests__/circleMeetupReminders.test.js` (23, each
    guard checked by removing it), `goalSpaceRename.test.js` (8),
    `CirclesSection.rename.test.tsx` (6), new cases in
    `CirclesSection.meetups.test.tsx`, `circleMeetups.cross.test.ts`,
    `renameRejection.cross.test.ts` and the rules spec.
  - Not built: meet-ups in Spaces (rank 3, owner call), a route (rank 16,
    owner call), a cap on who can come, a discussion on a meet-up, and
    skipping one week of a series while keeping it.

## The rest of the gap, ranked

Ranked by how often a club member would use it in a week, with a build
estimate for one agent including tests. "Owner call" marks a gap a lock rules
out until the owner reopens it.

| Rank | Gap                                                                                                                                                         | Estimate                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Meet-up reminder and repeat: a local reminder before a meet-up you're in (Strava sends one 24 hours before), and "Plan the same next week".                 | 1 day: client only, `src/lib/notifications.ts` local reminders, and a copy of the plan seven days on.                                          |
| 2    | A Space's members' sessions (row 7): the public sessions of its members, as Strava's Recent Activity.                                                       | 3 days: a trigger stamps a public activity with its author's Space ids, one collection-group index, a Space tab, the block filter, a backfill. |
| 3    | Meet-ups in Spaces (row 12) for a race or a local Space. **Owner call**: a public time and place, and the names of who is going, reach anyone who joins.    | 3 days once decided: the same callable with a Space path, report and block on a meet-up, and who is going shown only to those going.           |
| 4    | A Space's week in totals (row 9): "This week: 412 km by 38 members", a count that names no one, as the community goal does.                                 | 2 days: a server count per Space and week from the session triggers, swept with the account.                                                   |
| 5    | Notice of a new post in a Space you joined (row 11).                                                                                                        | 2 days: a bounded fan-out from the post trigger under the Spaces switch, with a daily cap per Space.                                           |
| 6    | A club bigger than eight (row 1). **Owner call**: GsPb1 caps a Circle at eight.                                                                             | 2 days once decided: the cap, notification fan-out bounds, and a member list that scrolls.                                                     |
| 7    | A club's weekly leaderboard (row 8). **Owner call**: Trim1 call 3(a) keeps one weekly ranking, the league.                                                  | 3 days once decided: a board per Circle or Space over the league's server tally (`functions/lib/weekTally.js`).                                |
| 8    | A Space's members you follow (row 6).                                                                                                                       | 1 day: one bounded query of the Space's members among your follows.                                                                            |
| 9    | Share a Space (row 13).                                                                                                                                     | Half a day: the share sheet with the Space's link, which already opens the Space.                                                              |
| 10   | Hand a Circle on, and a second admin (row 5): today the owner leaving ends it.                                                                              | 1.5 days: an ownership transfer callable, a role on the member doc, and the sheet's controls.                                                  |
| 11   | Rename a Circle (row 5).                                                                                                                                    | Half a day: an owner callable with the word filter.                                                                                            |
| 12   | Search Spaces by name (row 4).                                                                                                                              | Half a day: a text filter over the directory, which is client config.                                                                          |
| 13   | Show a Space or a Circle on your profile (row 16).                                                                                                          | 1 day: widen the opt-in race identity to any joined Space.                                                                                     |
| 14   | A challenge made for your Circle (row 18).                                                                                                                  | 4 days: a Circle-scoped challenge with the existing tiers and progress triggers.                                                               |
| 15   | A request queue for a Circle (row 3), beside the code.                                                                                                      | 1.5 days: a request collection and the owner's approve and decline.                                                                            |
| 16   | A route or pace groups on a meet-up (row 12). **Owner call** for the route: coordinates in a Circle cross GsPb1's GPS line. Pace groups fit the note today. | 1 day for pace groups as fields; the route waits on the call.                                                                                  |

- STATUS 2026-11-15: built (Run27 call 11), four Space gaps: rank 2, a
  Space's members' sessions; rank 4, its week in totals; rank 9, sharing a
  Space; rank 12, searching Spaces by name. Rows 7, 9, 13 and 4 above are
  partly closed by it.
  - **Members' sessions.** A Space's page has Posts and Sessions. Sessions
    lists the sessions members shared with everyone, newest first, 20 at a
    time, each drawn as Following and Explore draw it. Server-written rows,
    `spaces/{id}/sessions/{postId}` (`functions/lib/spaceFeed.js`), route a
    public post to each Space its author is in: `onActivitySpaceRows` on
    any post made public, narrowed, flagged or deleted;
    `onSpaceMemberWritten` on a join (the last 28 days, at most 20, a Tropos
    heuristic) or a leave; `onRestrictionWritten`, since the app cannot see
    who is restricted. The app reads each post on its own, where the rules
    refuse one across a block either way, keeps it only while public, and
    leaves out people blocked either way and posts the viewer hid. A run's
    map is the post's own, cut at the author's privacy zones when shared.
    Followers-only and private sessions never show, which is narrower than
    Strava (only "Only You" is left out there): CLAUDE.md's
    followers-only invariant outranks parity.
  - **The week.** "38 members trained this week: 127 sessions, 412 km" in
    the hero, from `spaces/{id}/weeks/{weekKey}`: a count and two sums over
    each member's credit (`users/{uid}/spaceWeeks`, the member's week
    counted from their saved sessions as the league counts them), never
    incremented, never summed by the app. Nothing is stored below 5 members
    (a Tropos heuristic, the floor a Space's member count already has), so
    a small group's training is not in a readable document. No top
    performer and no scatterplot: those name people (Trim1 call 3(a)).
  - **Sharing.** Share on the hero hands `https://troposfit.com/space/{id}`
    to the share sheet (the Web Share API, iOS's own sheet in the app, as
    every share in Tropos) or copies it. The universal-links file names
    `/space/*`, so once `IOS_APP_ID_PREFIX` is set the link opens the
    Space in the app.
  - **Search.** A field over the directory finds a Space by any word of its
    name, or a race by its city, ignoring case, accents and apostrophes,
    among every Space and race whatever the chips say. It runs on the
    phone over the app's own list (Spaces are config, Spc1a); Firestore
    has no case-insensitive or contains query to do it with.
  - Not built: post notifications, handing a Circle on, Circle challenges,
    join requests and a Space on a profile (Run27 call 11 says they wait),
    and renaming a Circle, which is outside this change.

Not a gap: verified clubs (Tropos's Spaces are its own, with Tropos Team
officials), and the 50,000-member limits Strava sets on large clubs.
