import SwiftUI
import WidgetKit

/// Streak (Wid1): the streak Home's flame shows, as one large figure that
/// reads across a room in StandBy, and a Lock Screen circle. Its words are
/// neutral, as the streak's sheet is (W7c, W8b, Streak1): the days, and the
/// best run of them. Nothing at risk, nothing to lose, no count of hours.
struct StreakWidget: Widget {
    static let kind = "TroposStreak"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HomeWidgetProvider()) { entry in
            StreakWidgetView(entry: entry)
        }
        .configurationDisplayName("Streak")
        .description("Your streak of days with something logged.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct StreakWidgetView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    /// The streak on the entry's day, or nil when only the app can say.
    private var days: Int? {
        entry.snapshot?.streak?.days(on: entry.date)
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                StreakCircle(days: days)
                    .accessoryCard(disc: true)
            } else {
                StreakSmall(days: days, best: entry.snapshot?.streak?.best ?? 0)
                    .staleMark(entry.stale)
                    .homeWidgetCard()
            }
        }
        .widgetURL(HomeWidgetLinks.home)
    }
}

/// "12-day streak", as the streak's sheet titles it, in its parts.
private func streakLabel(_ days: Int) -> String {
    "\(days)-day streak"
}

struct StreakSmall: View {
    let days: Int?
    let best: Int
    @Environment(\.widgetRenderingMode) private var mode

    private var bestLine: String? {
        guard let days, days > 0 else { return nil }
        if best > days { return "Best \(best) days" }
        return days > 1 ? "Your longest yet" : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: WidgetGlyph.streak)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(mode == .fullColor ? Palette.lifting : Color.primary)
                .widgetAccentable()
            Spacer(minLength: 2)
            if let days, days > 0 {
                Text("\(days)")
                    .font(.system(size: 56, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text("day streak")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                if let bestLine {
                    Text(bestLine)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            } else if days == 0 {
                Text("No streak yet")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.primary)
                Text("A workout, a run or a meal starts one.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            } else {
                Text("Open Tropos to see your streak")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private var accessibility: String {
        guard let days else { return "Streak. Open Tropos to see your streak." }
        if days == 0 { return "No streak yet." }
        return [streakLabel(days), bestLine].compactMap { $0 }.joined(separator: ". ")
    }
}

/// The Lock Screen's circle: the flame and the figure.
struct StreakCircle: View {
    let days: Int?

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: WidgetGlyph.streak)
                .font(.system(size: 13, weight: .semibold))
                .widgetAccentable()
            Text(days.map { "\($0)" } ?? "–")
                .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(days.map { streakLabel($0) } ?? "Streak")
    }
}

struct StreakWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            StreakWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small")
            StreakWidgetView(entry: .restDay)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · no streak yet")
            StreakWidgetView(entry: .firstUse)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · first use")
            StreakWidgetView(entry: .stale)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · a day old")
            StreakWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .accessoryCircular))
                .previewDisplayName("Lock Screen · circle")
        }
    }
}
