import Foundation
import WidgetKit

/// One moment of a widget: the snapshot the app last wrote, and the drinks
/// the food widget queued since.
struct HomeWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: HomeWidgetSnapshot?
    let drinks: [HomeWidgetStore.QueuedDrink]

    var stale: Bool {
        snapshot?.isStale(at: date) ?? false
    }
}

/// The timeline all three widgets draw from (W8c): an entry now, one at
/// midnight, when the day turns over to the tomorrow the app wrote, and
/// one when the snapshot goes stale, so each change lands on time with the
/// app asleep. WidgetKit asks again after an hour, the safety net, and
/// whenever the app writes (`HomeWidgetsPlugin`) or a drink is queued.
struct HomeWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeWidgetEntry {
        .sample
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeWidgetEntry) -> Void) {
        // The gallery shows what the widget is for, not a first-use note.
        let now = Date()
        let snapshot = HomeWidgetSnapshot.load()
        completion(
            context.isPreview && snapshot == nil
                ? .sample
                : HomeWidgetEntry(date: now, snapshot: snapshot, drinks: HomeWidgetStore.queuedDrinks())
        )
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) {
        let now = Date()
        let snapshot = HomeWidgetSnapshot.load()
        let drinks = HomeWidgetStore.queuedDrinks()
        var moments = [now, WidgetCalendar.nextMidnight(after: now)]
        if let staleAt = snapshot?.staleAt, staleAt > now {
            moments.append(staleAt)
        }
        let entries = moments.sorted().map {
            HomeWidgetEntry(date: $0, snapshot: snapshot, drinks: drinks)
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(60 * 60))))
    }
}

extension HomeWidgetEntry {
    /// A day in the shape the app writes, for previews and the gallery.
    static func sampleDay(
        _ date: Date,
        state: WidgetDayState = .planned,
        sport: WidgetSport = .lift,
        kicker: String = "Today",
        title: String = "Upper A",
        focus: String = "Chest, back and shoulders",
        minutes: String = "about 48 min",
        next: String = "Long 18K tomorrow",
        line: String = "Today · Upper A",
        race: String = "26 days to your marathon"
    ) -> WidgetDay {
        WidgetDay(
            date: WidgetCalendar.key(date),
            state: state,
            sport: sport,
            kicker: kicker,
            title: title,
            focus: focus,
            minutes: minutes,
            next: next,
            line: line,
            race: race,
            link: "https://troposfit.com/program?day=0&from=widget"
        )
    }

    static func sampleSnapshot(
        _ now: Date = Date(),
        today: WidgetDay? = nil,
        writtenAt: Date? = nil,
        streakDays: Int = 12
    ) -> HomeWidgetSnapshot {
        let calendar = WidgetCalendar.calendar
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now
        let weekday = (calendar.component(.weekday, from: now) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -weekday, to: now) ?? now
        let todayKey = WidgetCalendar.key(now)
        return HomeWidgetSnapshot(
            version: HomeWidgetSnapshot.currentVersion,
            writtenAt: (writtenAt ?? now).timeIntervalSince1970 * 1000,
            account: "0a1b2c3d",
            days: [
                today ?? sampleDay(now),
                sampleDay(
                    tomorrow,
                    sport: .run,
                    title: "Long 18K",
                    focus: "",
                    minutes: "",
                    next: "",
                    line: "Today · Long 18K",
                    race: "25 days to your marathon"
                )
            ],
            week: WidgetWeek(
                start: WidgetCalendar.key(monday),
                segments: [.liftDone, .runDone, .plannedLift, .plannedRun, .rest, .plannedBoth, .rest],
                done: 2,
                of: 6,
                summary: "2 of 6 sessions this week"
            ),
            streak: WidgetStreak(date: todayKey, days: streakDays, best: 20, loggedToday: true, nextDay: streakDays),
            food: WidgetFood(date: todayKey, eaten: 1240, target: 2400, protein: 62, proteinTarget: 140),
            water: WidgetWater(
                date: todayKey,
                ml: 750,
                targetMl: 2000,
                servingMl: 250,
                servingLabel: "Glass",
                drinkIds: []
            )
        )
    }

    static var sample: HomeWidgetEntry {
        HomeWidgetEntry(date: Date(), snapshot: sampleSnapshot(), drinks: [])
    }

    /// Nothing written yet: a new install, or after sign-out.
    static var firstUse: HomeWidgetEntry {
        HomeWidgetEntry(date: Date(), snapshot: nil, drinks: [])
    }

    /// The app last wrote more than a day ago.
    static var stale: HomeWidgetEntry {
        let now = Date()
        return HomeWidgetEntry(
            date: now,
            snapshot: sampleSnapshot(now, writtenAt: now.addingTimeInterval(-25 * 60 * 60)),
            drinks: []
        )
    }

    static var restDay: HomeWidgetEntry {
        let now = Date()
        return HomeWidgetEntry(
            date: now,
            snapshot: sampleSnapshot(
                now,
                today: sampleDay(
                    now,
                    state: .rest,
                    sport: .rest,
                    title: "Rest day",
                    focus: "",
                    minutes: "",
                    line: "Tomorrow · Long 18K"
                ),
                streakDays: 0
            ),
            drinks: []
        )
    }

    static var doneToday: HomeWidgetEntry {
        let now = Date()
        return HomeWidgetEntry(
            date: now,
            snapshot: sampleSnapshot(
                now,
                today: sampleDay(
                    now,
                    state: .done,
                    kicker: "Done today",
                    focus: "",
                    minutes: "",
                    line: "Tomorrow · Long 18K",
                    race: ""
                )
            ),
            drinks: [
                HomeWidgetStore.QueuedDrink(
                    id: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F",
                    account: "0a1b2c3d",
                    date: WidgetCalendar.key(now),
                    ml: 250,
                    at: now.timeIntervalSince1970 * 1000
                )
            ]
        )
    }

    static var noPlan: HomeWidgetEntry {
        let now = Date()
        return HomeWidgetEntry(
            date: now,
            snapshot: sampleSnapshot(
                now,
                today: sampleDay(
                    now,
                    state: .noPlan,
                    sport: .none,
                    title: "No plan yet",
                    focus: "Set up your training in Tropos",
                    minutes: "",
                    next: "",
                    line: "No training plan yet",
                    race: ""
                )
            ),
            drinks: []
        )
    }
}
