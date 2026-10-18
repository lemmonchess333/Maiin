# Challenge calendar

The server's `rolloverChallenges` scheduled function runs daily at 00:05 UTC.
It creates the current week's, month's and season's definitions if missing,
plus one day of lookahead so countries ahead of UTC can start on their local
first day. No ChatGPT session or always-on computer is needed.

The app uses local calendar days to show and credit challenges. It refreshes
when the local date changes and when the app resumes, including when the
next period was created early and Firestore has no new write at midnight.

## What changes in November

On 1 November 2026 the monthly editions become November Mileage, November
Hybrid Hero, November Strength Builder, November Active Days, Fastest 5K and
Together: 1,000 km.
These are fresh editions of the same formats, with their own memberships and
progress. Users choose which new editions to join. Joining does not change
their training plan. Existing server backfill credits eligible training already
logged within the edition's activity window, including when joining mid-month.

Weekly Warrior resets every Monday. Autumn Push continues through 30 November;
Winter Bulk starts on 1 December. The seasonal calendar is March–May,
June–August, September–November and December–February. It is the shared product
calendar, not a hemisphere or weather forecast. Finished challenges the person
joined remain in the finale section for seven days.

Strength Builder uses the existing `total_volume` metric and sums logged
lifting volume. Its three tiers are stored in kilograms (5,000 / 15,000 /
30,000) and displayed in the user's lifting unit. It is a record of normal
training, not a recommendation to add sessions or lift more than planned.

## Rotating featured monthly goal

One featured goal rotates automatically on the first of each month. It stays
visible above the collapsed list of other available challenges; once joined,
it leads the person's challenge list. The existing core goals remain available.

| Months                                           | Featured goal    | Bronze / Silver / Gold  |
| ------------------------------------------------ | ---------------- | ----------------------- |
| January, March, May, July, September, November   | Active Days      | 8 / 12 / 20 days        |
| February, April, June, August, October, December | Training Minutes | 120 / 300 / 600 minutes |

Active Days counts each local calendar date once across logged lifts and
eligible runs. Multiple sessions on the same date count as one day. Rest days
do not reset progress. Training Minutes sums the saved durations of those
sessions, including any duration already recorded by the workout logger; the
challenge does not invent a time estimate. Partial minutes combine, and the
app displays completed whole minutes.

Both use current saved activity within the month's window. Joining mid-month
credits earlier eligible sessions. Editing or deleting a session updates the
total; deleting one of several sessions on a day preserves that active day.
Leave/rejoin and retried or delayed events recalculate current facts rather
than applying the same activity twice. New-goal progress is a live subscription
while the challenge is visible, including the recent finale window.

## Monthly challenge notifications

Settings → Notifications → Push notifications has a separate **Monthly
challenges** switch. It defaults off, including for people who already allow
other push notifications. Both the global push switch and Monthly challenges
must be enabled, and the device must have notification permission and a
registered token. The app never prompts for permission just because it opened.

`hourlyChallengeAnnouncements` checks for the current month's published
featured challenge and sends one announcement around 9 am in the person's
stored time zone. It tries on the first three local days of the month, allowing
for a delayed calendar publication or failed delivery. Unknown time zones are
skipped. Early lookahead publication never announces next month's edition.
The notification opens Social's Together tab, where the featured challenge is
shown. Joining a challenge is still a separate choice.

The server claims one account/month before sending, preventing overlapping
scheduler runs from sending duplicate announcements. Multiple registered
devices may each display that one announcement. A confirmed zero-delivery
result can be retried during the three-day window. An ambiguous transport
failure or crash after the claim is consumed rather than risking duplicates;
push delivery is best effort, not an exactly-once transport guarantee. No
separate seasonal announcement or in-app inbox item is sent.

The iPhone native integration uses Firebase Messaging and APNs. It requires a
new signed native build, Apple Push capability/provisioning, and an APNs key
uploaded to Firebase. An older native binary without the plugin continues to
offer its existing local reminders only. A web deployment cannot add a native
plugin to an installed TestFlight app. See [native push setup](ios-push-notifications.md).

The browser channel uses the existing FCM web registration. On iPhone, open a
supported Home Screen web app and allow notifications; an ordinary browser tab
is insufficient. See [Apple's Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
Neither channel needs a ChatGPT session or a computer left running.

## Publishing this change

The UI and new cover assets need the normal web/native release. The production
release deploys Functions and verifies the executing source, then triggers the
existing rollover Scheduler job once and reads back the current canonical
definitions before publishing the web app. This makes new definitions visible
at release time. The daily rollover continues maintaining the calendar without
overwriting existing memberships, counts or progress. The source of truth is
`functions/lib/challengeDefs.js`.
