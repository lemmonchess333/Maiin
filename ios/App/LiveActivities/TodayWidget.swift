import SwiftUI
import WidgetKit

/// Today (Wid1): today's session with its focus and minutes, on a medium
/// widget the week's seven segments too, and one line on the Lock Screen
/// ("Tomorrow · Long 18K") with a race goal's countdown under it. Its
/// states are W8b's, written by the app: a session to do, done today, a
/// rest day naming the next, no plan. Tapping opens the session in Train.
struct TodayWidget: Widget {
    static let kind = "TroposToday"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HomeWidgetProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's session, and your week so far.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct TodayWidgetView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    private var day: WidgetDay? {
        entry.snapshot?.day(for: entry.date)
    }

    private var link: URL {
        day.map { HomeWidgetLinks.url($0.link) } ?? HomeWidgetLinks.home
    }

    var body: some View {
        content
            .widgetURL(link)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline:
            TodayInline(day: day)
                .accessoryCard(disc: false)
        case .accessoryRectangular:
            TodayRectangular(day: day)
                .staleMark(entry.stale)
                .accessoryCard(disc: false)
        case .systemMedium:
            TodayMedium(entry: entry, day: day)
                .staleMark(entry.stale)
                .homeWidgetCard()
        default:
            TodaySmall(day: day)
                .staleMark(entry.stale)
                .homeWidgetCard()
        }
    }
}

/// What a day without a written day shows: before the app has written one,
/// after sign-out, or two days on without it.
private let noDayNote = "Open Tropos to see today's session"

/// The session: the kicker in its sport's colour, the name as the one big
/// line, then its focus and minutes, or the next session once it is done.
struct TodaySessionView: View {
    let day: WidgetDay
    /// The name's size: the widget's one hero.
    let titleSize: CGFloat

    private var detail: [String] {
        switch day.state {
        case .planned, .noPlan:
            return [day.focus, day.minutes].filter { !$0.isEmpty }
        case .done, .rest:
            return [day.next].filter { !$0.isEmpty }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            WidgetKicker(
                symbol: WidgetGlyph.of(day),
                title: day.kicker,
                color: day.state == .done ? Palette.done : WidgetPalette.sport(day.sport)
            )
            Text(day.title)
                .font(.system(size: titleSize, weight: .bold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            ForEach(detail, id: \.self) { line in
                Text(line)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct TodaySmall: View {
    let day: WidgetDay?

    var body: some View {
        if let day {
            VStack(alignment: .leading, spacing: 0) {
                TodaySessionView(day: day, titleSize: 20)
                Spacer(minLength: 4)
                if !day.race.isEmpty {
                    Text(day.race)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            OpenTroposNote(text: noDayNote)
        }
    }
}

struct TodayMedium: View {
    let entry: HomeWidgetEntry
    let day: WidgetDay?

    var body: some View {
        if let day {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 8) {
                    TodaySessionView(day: day, titleSize: 22)
                    Spacer(minLength: 0)
                    if !day.race.isEmpty {
                        Text(day.race)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                            .lineLimit(2)
                            .frame(maxWidth: 110, alignment: .trailing)
                    }
                }
                Spacer(minLength: 6)
                if let week = entry.snapshot?.week, let today = week.index(of: entry.date) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(week.summary)
                            .font(.system(size: 12, weight: .medium).monospacedDigit())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        WeekSegments(week: week, today: today)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            OpenTroposNote(text: noDayNote)
        }
    }
}

/// The Lock Screen's rectangle: the day's line, what it holds, and a race
/// goal's countdown. Monochrome there, so the line's weight carries it.
struct TodayRectangular: View {
    let day: WidgetDay?

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let day {
                Text(day.line)
                    .font(.headline)
                    .widgetAccentable()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                let detail = day.state == .planned
                    ? [day.focus, day.minutes].filter { !$0.isEmpty }.joined(separator: " · ")
                    : ""
                if !detail.isEmpty {
                    Text(detail).lineLimit(1)
                }
                if !day.race.isEmpty {
                    Text(day.race).lineLimit(1)
                }
            } else {
                Text("Tropos").font(.headline)
                Text(noDayNote).lineLimit(2)
            }
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The Lock Screen's line over the clock: the day's line, or the race's
/// countdown on a day with no session to name.
struct TodayInline: View {
    let day: WidgetDay?

    private var text: String {
        guard let day else { return "Tropos" }
        let generic = day.line == "Rest day" || day.line == "Done today" || day.line == "Skipped today"
        return generic && !day.race.isEmpty ? day.race : day.line
    }

    var body: some View {
        Text(text)
    }
}

struct TodayWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TodayWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · a session to do")
            TodayWidgetView(entry: .doneToday)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · done today")
            TodayWidgetView(entry: .restDay)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · rest day")
            TodayWidgetView(entry: .noPlan)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · no plan")
            TodayWidgetView(entry: .firstUse)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · first use")
            TodayWidgetView(entry: .stale)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · a day old")
            TodayWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium")
            TodayWidgetView(entry: .restDay)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · rest day")
            TodayWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                .previewDisplayName("Lock Screen · rectangle")
            TodayWidgetView(entry: .doneToday)
                .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                .previewDisplayName("Lock Screen · rectangle, done")
            TodayWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .accessoryInline))
                .previewDisplayName("Lock Screen · inline")
        }
    }
}
