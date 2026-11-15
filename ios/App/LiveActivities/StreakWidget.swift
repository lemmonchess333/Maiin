import SwiftUI
import WidgetKit

/// Streak (Wid1), drawn the way Wid2 call 5 decided: the flame with the
/// count on it, large enough to read across a room in StandBy, and on the
/// Lock Screen a circle with the flame and the count in one tone. Its
/// words are neutral, as the streak's sheet is (W7c, W8b, Streak1): the
/// days, nothing at risk, nothing to lose, no count of hours.
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
                StreakSmall(days: days)
                    .staleMark(entry.stale)
                    .homeWidgetCard()
            }
        }
        .widgetURL(HomeWidgetLinks.home)
    }
}

/// "12-day streak", as the streak's sheet titles it.
private func streakLabel(_ days: Int) -> String {
    "\(days)-day streak"
}

struct StreakSmall: View {
    let days: Int?
    @Environment(\.widgetRenderingMode) private var mode

    /// The flame in the brand purple, its base deeper than its tip, as the
    /// app's flame is; the track's grey before a streak has begun.
    private var flame: AnyShapeStyle {
        guard mode == .fullColor else { return AnyShapeStyle(Color.primary) }
        guard let days, days > 0 else { return AnyShapeStyle(WidgetPalette.track) }
        return AnyShapeStyle(
            LinearGradient(colors: [Palette.flameBase, Palette.flameTip], startPoint: .bottom, endPoint: .top)
        )
    }

    var body: some View {
        if let days {
            VStack(spacing: 0) {
                ZStack {
                    Image(systemName: WidgetGlyph.streak)
                        .font(.system(size: 96, weight: .regular))
                        .foregroundStyle(flame)
                        .widgetAccentable()
                    Text("\(days)")
                        .font(.system(size: 32, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(days > 0 && mode == .fullColor ? Color.white : Color.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .frame(maxWidth: 58)
                        // The flame's body is below its middle.
                        .offset(y: 14)
                }
                Text(days > 0 ? "day streak" : "No streak yet")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(days > 0 ? streakLabel(days) : "No streak yet")
        } else {
            OpenTroposNote(text: "Open Tropos to see your streak")
        }
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
