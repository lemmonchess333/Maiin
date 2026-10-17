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
Hybrid Hero, November Strength Builder, Fastest 5K and Together: 1,000 km.
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

## Notifications today

There is no sender for new monthly or seasonal challenge announcements.
Rollover creates challenge documents; it does not send a push or an inbox item.
No announcement notification was added in this change.

The current native Capacitor iPhone build has local reminders but no APNs
remote-push registration. `isRemotePushOffered()` deliberately returns false
for native. The browser app has FCM web-push registration and existing nudge
senders, subject to consent. iPhone web push requires a supported Home Screen
web app and permission; an ordinary browser tab is not that installation.
See [Apple's Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

For new-challenge alerts, the next useful addition would be one optional
monthly announcement linking to Social, with an explicit Challenges switch,
quiet hours, per-account/period deduplication, and native APNs delivery as well
as the existing web channel. A local repeating reminder can announce the
calendar date, but cannot verify that new server content was successfully
published while the app is closed. Those are separate delivery guarantees.

## Publishing this change

The UI and new cover assets need the normal web/native release. Deploying
Functions updates the server definitions; the next daily rollover then adds
the current month's Strength Builder without overwriting existing challenge
counts or progress. The source of truth is `functions/lib/challengeDefs.js`.
