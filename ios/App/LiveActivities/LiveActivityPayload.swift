import Foundation
import LiveActivitiesKit

/// What the app sent an activity, read from its content state.
///
/// `capacitor-live-activities` starts every activity with its own
/// `DynamicActivityAttributes`, whose content state carries the app's `data`
/// object as `[String: AnyCodable]`. Tropos sends one kind per activity,
/// named by `kind`, and the keys each kind reads here are the ones
/// `src/lib/liveActivityContract.ts` lists: `liveActivityContract.test.ts`
/// holds the two to each other. A state this cannot read is `.unknown`,
/// which draws the app's name and nothing else.
enum LiveActivityPayload {
    case run(RunPayload)
    case rest(RestPayload)
    case unknown

    init(_ data: [String: AnyCodable]) {
        let fields = PayloadFields(data)
        switch fields.string("kind") {
        case "run":
            self = .run(RunPayload(fields))
        case "rest":
            if let rest = RestPayload(fields) {
                self = .rest(rest)
            } else {
                self = .unknown
            }
        default:
            self = .unknown
        }
    }
}

/// Typed reads of the content state. The plugin decodes each value as a
/// Bool, an Int, a Double or a String, the first that fits, so a number
/// can arrive as either numeric type, and a missing value reads as empty.
struct PayloadFields {
    let data: [String: AnyCodable]

    init(_ data: [String: AnyCodable]) {
        self.data = data
    }

    func string(_ key: String) -> String {
        guard let value = data[key]?.value else { return "" }
        return (value as? String) ?? ""
    }

    func number(_ key: String) -> Double? {
        guard let value = data[key]?.value else { return nil }
        switch value {
        case let number as Double:
            return number
        case let number as Int:
            return Double(number)
        case let text as String:
            return Double(text)
        default:
            return nil
        }
    }

    func flag(_ key: String) -> Bool {
        guard let value = data[key]?.value else { return false }
        return (value as? Bool) ?? false
    }
}

/// A run, as the run screen's HUD shows it. Every figure arrives formatted
/// by the app, its units and its pace included, so the lock screen and the
/// HUD read the same.
struct RunPayload {
    /// "3.4 km", or "—" before the first metres.
    let distance: String
    /// "5:12 /km", or "—" while the pace is unknown.
    let pace: String
    /// The run timer's own label, "23:41".
    let elapsed: String
    /// "Recording" or "Paused".
    let label: String
    let paused: Bool

    init(_ fields: PayloadFields) {
        distance = fields.string("distance")
        pace = fields.string("pace")
        elapsed = fields.string("elapsed")
        label = fields.string("label")
        paused = fields.flag("paused")
    }
}

/// A lift's rest: when it started and ends, and the set it leads to.
struct RestPayload {
    let startedAt: Date
    let endsAt: Date
    /// The exercise of the next set, "Bench Press", or empty.
    let exercise: String
    /// The next set as the rest band names it, "Set 2 · 15 kg × 10", or empty.
    let nextSet: String

    /// Nil without an end: there is no countdown to draw.
    init?(_ fields: PayloadFields) {
        guard let end = fields.number("endsAt") else { return nil }
        let start = min(fields.number("startedAt") ?? end, end)
        startedAt = Date(timeIntervalSince1970: start / 1000)
        endsAt = Date(timeIntervalSince1970: end / 1000)
        exercise = fields.string("exercise")
        nextSet = fields.string("set")
    }

    /// The rest, start to end, for the system's countdown and bar.
    var interval: ClosedRange<Date> {
        startedAt...endsAt
    }
}

/// Splits one of the app's labels into its figure and its unit, so the
/// unit can be drawn smaller: "3.4 km" is ("3.4", "km"), "5:12 /km" is
/// ("5:12", "/km"). The app puts one space between a figure and its unit;
/// a label without one ("—", "23:41") is all figure.
func figureAndUnit(_ label: String) -> (figure: String, unit: String) {
    guard let space = label.firstIndex(of: " ") else { return (label, "") }
    let figure = String(label[..<space])
    let unit = String(label[label.index(after: space)...])
    return (figure, unit)
}
