import SwiftUI
import WidgetKit

/// Today (Wid1), drawn the way Wid2 call 5 decided: the session's drawing
/// at the right in one soft light of its colour, with the kicker, the name
/// and the minutes or distance beside it; a medium widget adds the week's
/// seven segments and the count; a rest day has no drawing. On the Lock
/// Screen, lines of text in one tone ("Tomorrow · Long 18K"), a race goal's
/// countdown among them. Its states are W8b's, written by the app: a
/// session to do, done today, a rest day naming the next, no plan. Tapping
/// opens the session in Train.
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
    @Environment(\.widgetRenderingMode) private var mode

    private var day: WidgetDay? {
        entry.snapshot?.day(for: entry.date)
    }

    private var link: URL {
        day.map { HomeWidgetLinks.url($0.link) } ?? HomeWidgetLinks.home
    }

    /// The soft light behind the drawing: only with a drawing, and only
    /// where the widget is drawn in colour.
    private var light: Color? {
        guard let day, !day.art.isEmpty, mode == .fullColor else { return nil }
        return WidgetPalette.sport(day.sport)
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
            TodayRectangular(day: day, week: entry.snapshot?.week)
                .staleMark(entry.stale)
                .accessoryCard(disc: false)
        case .systemMedium:
            TodayMedium(entry: entry, day: day)
                .staleMark(entry.stale)
                .homeWidgetCard(light: light)
        default:
            TodaySmall(day: day)
                .staleMark(entry.stale)
                .homeWidgetCard(light: light)
        }
    }
}

/// What a day without a written day shows: before the app has written one,
/// after sign-out, or two days on without it.
private let noDayNote = "Open Tropos to see today's session"

extension WidgetDay {
    /// The figure under the name: a run's distance, else the minutes.
    var figure: String {
        sport == .run && !focus.isEmpty ? focus : minutes
    }

    /// The line under the name: what the session holds while it is to do,
    /// the next session once it is done or on a rest day.
    var detail: String {
        switch state {
        case .planned, .noPlan:
            return [focus, minutes].filter { !$0.isEmpty }.joined(separator: " · ")
        case .done, .rest:
            return next
        }
    }

    /// The kicker's colour: green once done, else the sport's.
    var kickerColor: Color {
        state == .done ? Palette.done : WidgetPalette.sportText(sport)
    }

    var kickerSymbol: String? {
        state == .done ? WidgetGlyph.of(self) : nil
    }
}

/// The kicker and the session's name, the widget's one hero.
struct TodayHeading: View {
    let day: WidgetDay
    let titleSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            WidgetKicker(symbol: day.kickerSymbol, title: day.kicker, color: day.kickerColor)
            Text(day.title)
                .font(.system(size: titleSize, weight: .heavy))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.75)
        }
    }
}

struct TodaySmall: View {
    let day: WidgetDay?

    var body: some View {
        if let day {
            let drawn = !day.art.isEmpty
            ZStack(alignment: .bottomTrailing) {
                SessionDrawing(art: day.art, height: 96)
                VStack(alignment: .leading, spacing: 0) {
                    TodayHeading(day: day, titleSize: 19)
                        .frame(maxWidth: drawn ? CGFloat(96) : CGFloat.infinity, alignment: .leading)
                    Spacer(minLength: 4)
                    footer(day)
                        .frame(maxWidth: drawn ? CGFloat(64) : CGFloat.infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .accessibilityElement(children: .combine)
        } else {
            OpenTroposNote(text: noDayNote)
        }
    }

    @ViewBuilder
    private func footer(_ day: WidgetDay) -> some View {
        if day.state == .planned, !day.figure.isEmpty {
            Text(day.figure)
                .font(.system(size: 13, weight: .bold).monospacedDigit())
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        } else if !day.detail.isEmpty {
            Text(day.detail)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
        }
    }
}

struct TodayMedium: View {
    let entry: HomeWidgetEntry
    let day: WidgetDay?

    var body: some View {
        if let day {
            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    TodayHeading(day: day, titleSize: 20)
                    if !day.detail.isEmpty {
                        Text(day.detail)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .padding(.top, 2)
                    }
                    if !day.race.isEmpty {
                        Text(day.race)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .padding(.top, 1)
                    }
                    Spacer(minLength: 6)
                    if let week = entry.snapshot?.week, let today = week.index(of: entry.date) {
                        VStack(alignment: .leading, spacing: 6) {
                            WeekSegments(week: week, today: today, letters: false)
                            Text(week.summary)
                                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .frame(
                    maxWidth: day.art.isEmpty ? CGFloat.infinity : CGFloat(190),
                    maxHeight: .infinity,
                    alignment: .topLeading
                )
                if !day.art.isEmpty {
                    Spacer(minLength: 0)
                    SessionDrawing(art: day.art, height: 104)
                }
            }
            .accessibilityElement(children: .combine)
        } else {
            OpenTroposNote(text: noDayNote)
        }
    }
}

/// The Lock Screen's rectangle: the day's line, then what it holds, a race
/// goal's countdown or the week's count. One tone there and no drawing, so
/// the first line's weight carries it.
struct TodayRectangular: View {
    let day: WidgetDay?
    let week: WidgetWeek?

    private func lines(_ day: WidgetDay) -> [String] {
        let detail = day.state == .planned ? day.detail : ""
        let rest = [detail, day.race, week?.summary ?? ""].filter { !$0.isEmpty }
        return Array(rest.prefix(2))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let day {
                Text(day.line)
                    .font(.headline)
                    .widgetAccentable()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                ForEach(lines(day), id: \.self) { line in
                    Text(line).lineLimit(1).minimumScaleFactor(0.85)
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
