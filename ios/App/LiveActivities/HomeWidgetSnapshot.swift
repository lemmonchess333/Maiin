import Foundation

/// The snapshot the app writes for the Home Screen and Lock Screen widgets
/// (Wid1): `HomeWidgetSnapshot` in `src/lib/homeWidgetContract.ts`, which
/// `homeWidgetContract.test.ts` holds to these structs, property for
/// property. The app writes every word; the widget picks the day, adds the
/// drinks queued since, and counts calories down.
///
/// A snapshot that does not decode, or is of another version, reads as
/// none: the widgets draw their first-use state rather than guess.
struct HomeWidgetSnapshot: Decodable {
    let version: Int
    /// When the app wrote it, ms since 1970.
    let writtenAt: Double
    /// The account's tag, which each queued drink carries.
    let account: String
    /// Today, then tomorrow.
    let days: [WidgetDay]
    let week: WidgetWeek?
    let streak: WidgetStreak?
    let food: WidgetFood?
    let water: WidgetWater?

    static let currentVersion = 1
    /// W8d: a day without a fresh snapshot, then the widget dims.
    static let staleAfter: TimeInterval = 24 * 60 * 60

    static func load() -> HomeWidgetSnapshot? {
        guard let data = HomeWidgetStore.snapshotData(),
              let snapshot = try? JSONDecoder().decode(HomeWidgetSnapshot.self, from: data),
              snapshot.version == currentVersion else { return nil }
        return snapshot
    }

    var written: Date {
        Date(timeIntervalSince1970: writtenAt / 1000)
    }

    /// The moment the snapshot goes stale.
    var staleAt: Date {
        written.addingTimeInterval(Self.staleAfter)
    }

    func isStale(at date: Date) -> Bool {
        date >= staleAt
    }

    /// The day the app wrote for `date`, if it wrote one.
    func day(for date: Date) -> WidgetDay? {
        let key = WidgetCalendar.key(date)
        return days.first { $0.date == key }
    }
}

/// One day: `WidgetDay` in homeWidgetContract.ts.
struct WidgetDay: Decodable {
    let date: String
    let state: WidgetDayState
    let sport: WidgetSport
    let kicker: String
    let title: String
    let focus: String
    let minutes: String
    let next: String
    let line: String
    let race: String
    let link: String
}

/// W8b's states, driven by what was done, never by the clock.
enum WidgetDayState: String, Decodable {
    case planned
    case done
    case rest
    case noPlan = "no-plan"
}

enum WidgetSport: String, Decodable {
    case lift
    case run
    case both
    case rest
    case none
}

/// One of the week's seven segments, as Home's strip draws it.
enum WidgetSegment: String, Decodable {
    case liftDone = "lift-done"
    case runDone = "run-done"
    case bothDone = "both-done"
    case plannedLift = "planned-lift"
    case plannedRun = "planned-run"
    case plannedBoth = "planned-both"
    case missed
    case rest
    case before

    var isPlanned: Bool {
        self == .plannedLift || self == .plannedRun || self == .plannedBoth
    }
}

struct WidgetWeek: Decodable {
    /// The week's Monday, "yyyy-MM-dd".
    let start: String
    let segments: [WidgetSegment]
    let done: Int
    let of: Int?
    /// "3 of 5 sessions this week".
    let summary: String

    /// Where `date` falls in the week, or nil for a day outside it: the
    /// week has turned over since the app last wrote.
    func index(of date: Date) -> Int? {
        guard segments.count == 7,
              let days = WidgetCalendar.days(from: start, to: WidgetCalendar.key(date)),
              (0..<7).contains(days) else { return nil }
        return days
    }
}

struct WidgetStreak: Decodable {
    let date: String
    let days: Int
    let best: Int
    let loggedToday: Bool
    let nextDay: Int?

    /// The streak as Home's flame will show it on `date`: the day written,
    /// or the next day when today was logged (the today/yesterday rule).
    /// Nil when the widget cannot know it without the app.
    func days(on date: Date) -> Int? {
        let key = WidgetCalendar.key(date)
        if key == self.date { return self.days }
        if WidgetCalendar.days(from: self.date, to: key) == 1 { return self.nextDay }
        return nil
    }
}

struct WidgetFood: Decodable {
    let date: String
    let eaten: Int
    let target: Int
    let protein: Int
    let proteinTarget: Int
    /// When the app wrote these figures, ms: Food writes them on their own
    /// (`writeSections`), so they can be newer than the snapshot.
    let updatedAt: Double
}

struct WidgetWater: Decodable {
    let date: String
    let ml: Int
    let targetMl: Int
    let servingMl: Int
    let servingLabel: String
    let drinkIds: [String]
    /// When the app wrote these figures, ms.
    let updatedAt: Double
}

extension HomeWidgetSnapshot {
    /// The day's water as the food widget draws it: the total the app wrote
    /// for the day, and every drink queued for it that the total does not
    /// count yet, so a tap on "+" shows at once and never twice.
    func waterMl(on date: Date, queued: [HomeWidgetStore.QueuedDrink]) -> Int {
        let key = WidgetCalendar.key(date)
        let counted = Set(water?.date == key ? water?.drinkIds ?? [] : [])
        let base = water?.date == key ? water?.ml ?? 0 : 0
        let added = queued
            .filter { $0.account == account && $0.date == key && !counted.contains($0.id) }
            .reduce(0) { $0 + $1.ml }
        return base + added
    }

    /// When the food widget's figures go stale: a day after the newer of
    /// the snapshot and its food and water sections, which the app writes
    /// on their own from Food and from today's water log.
    var foodStaleAt: Date {
        let newest = max(writtenAt, food?.updatedAt ?? 0, water?.updatedAt ?? 0)
        return Date(timeIntervalSince1970: newest / 1000).addingTimeInterval(Self.staleAfter)
    }

    /// The day's food, when the app wrote it for that day.
    func food(on date: Date) -> WidgetFood? {
        guard let food = self.food, food.date == WidgetCalendar.key(date) else { return nil }
        return food
    }
}

/// The person's local days, as the app keys them ("yyyy-MM-dd"), in the
/// Gregorian calendar whatever the phone's, in the phone's time zone.
enum WidgetCalendar {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    static func key(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04ld-%02ld-%02ld", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// Whole calendar days from one key to another.
    static func days(from start: String, to end: String) -> Int? {
        guard let from = date(start), let to = date(end) else { return nil }
        return calendar.dateComponents([.day], from: from, to: to).day
    }

    static func nextMidnight(after date: Date) -> Date {
        calendar.nextDate(
            after: date,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? date.addingTimeInterval(24 * 60 * 60)
    }
}

/// A volume as the app writes one (`formatWaterVolume` in waterUnits.ts):
/// "250 ml" under a litre, then litres with trailing zeros trimmed, "1.25 L",
/// "2 L". Here because the widget adds queued drinks to the app's total.
func waterVolume(_ ml: Int) -> String {
    let value = max(0, ml)
    if value < 1000 { return "\(value) ml" }
    var litres = String(format: "%.2f", Double(value) / 1000)
    while litres.hasSuffix("0") { litres.removeLast() }
    if litres.hasSuffix(".") { litres.removeLast() }
    return "\(litres) L"
}

/// Where a widget's tap opens the app (`widgetUrl` in widgetLinks.ts): the
/// app's own origin and path, marked as a widget's.
enum HomeWidgetLinks {
    static let home = URL(string: "https://troposfit.com/?from=widget")!
    static let food = URL(string: "https://troposfit.com/food?from=widget")!

    /// A day's link as the app wrote it, or Home.
    static func url(_ link: String) -> URL {
        guard let url = URL(string: link), url.host == "troposfit.com" else { return home }
        return url
    }
}
