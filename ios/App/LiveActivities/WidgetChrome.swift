import SwiftUI
import UIKit
import WidgetKit

/// The Home Screen widgets' card: white by day and the app's dark card by
/// night, as the app's own cards are. The chrome is neutral, the system's
/// text colours on it; colour is on the person's data only (DS4): purple
/// lifting, coral running, orange food, teal water, from `Palette`.
enum WidgetPalette {
    static let card = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(rgb: 0x17171B) : .white
    })

    /// A track or an empty segment: the text colour, faint.
    static let track = Color.primary.opacity(0.12)

    static func sport(_ sport: WidgetSport) -> Color {
        switch sport {
        case .lift, .both: return Palette.lifting
        case .run: return Palette.running
        case .rest, .none: return .secondary
        }
    }
}

extension UIColor {
    /// A colour from its hex value, 0xRRGGBB, in sRGB.
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

/// The SF Symbol each state is drawn with.
enum WidgetGlyph {
    static func of(_ day: WidgetDay) -> String {
        switch day.state {
        case .done: return "checkmark.circle.fill"
        case .noPlan: return "calendar"
        case .rest: return "leaf.fill"
        case .planned:
            return day.sport == .run ? "figure.run" : "dumbbell.fill"
        }
    }

    static let streak = "flame.fill"
    static let food = "fork.knife"
    static let water = "drop.fill"
    static let stale = "arrow.clockwise"
}

extension View {
    /// A Home Screen widget's card. iOS 17 draws it behind the content with
    /// its own margins, and removes it in StandBy; iOS 16 has neither, so
    /// the content gets the margins and the colour itself.
    @ViewBuilder
    func homeWidgetCard() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { WidgetPalette.card }
        } else {
            padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(WidgetPalette.card)
        }
    }

    /// A Lock Screen accessory's background: the system's own translucent
    /// disc for a circle, none for a line.
    @ViewBuilder
    func accessoryCard(disc: Bool) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) {
                if disc { AccessoryWidgetBackground() } else { Color.clear }
            }
        } else if disc {
            background { AccessoryWidgetBackground() }
        } else {
            self
        }
    }

    /// W8d: a day without a fresh snapshot is drawn at 60%, still legible,
    /// with a refresh mark in its corner. Hiding it would read as the app
    /// broken; drawing it as fresh would be untrue.
    func staleMark(_ stale: Bool) -> some View {
        opacity(stale ? 0.6 : 1)
            .overlay(alignment: .topTrailing) {
                if stale {
                    Image(systemName: WidgetGlyph.stale)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Not updated for a day. Open Tropos to update.")
                }
            }
    }
}

/// The small line over a widget's figure: its glyph and words in the
/// data's colour where colour is drawn, the text colour on the Lock Screen.
struct WidgetKicker: View {
    let symbol: String
    let title: String
    let color: Color
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        Label {
            Text(title).lineLimit(1)
        } icon: {
            Image(systemName: symbol)
        }
        .labelStyle(KickerLabelStyle())
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(mode == .fullColor ? color : .primary)
        .widgetAccentable()
    }
}

private struct KickerLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon
            configuration.title
        }
    }
}

/// The week's seven segments, Monday first, as Home's strip draws them:
/// done filled in the sport's colour, planned outlined in it, a planned day
/// gone by dashed, rest the bare track. Today is outlined in the text
/// colour over whichever it is.
struct WeekSegments: View {
    let week: WidgetWeek
    /// Today's place in the week.
    let today: Int
    @Environment(\.widgetRenderingMode) private var mode

    private static let letters = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { index in
                VStack(spacing: 3) {
                    segment(shown(index))
                        .frame(height: 7)
                        .overlay {
                            if index == today {
                                Capsule().strokeBorder(Color.primary, lineWidth: 1.5)
                            }
                        }
                    Text(Self.letters[index])
                        .font(.system(size: 10, weight: index == today ? .bold : .medium))
                        .foregroundStyle(index == today ? Color.primary : Color.secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(week.summary)
    }

    /// A planned day before today has gone by: the snapshot may be from
    /// yesterday, and the strip turns it dashed as Home would.
    private func shown(_ index: Int) -> WidgetSegment {
        let segment = week.segments[index]
        return segment.isPlanned && index < today ? .missed : segment
    }

    private func color(_ color: Color) -> Color {
        mode == .fullColor ? color : .primary
    }

    @ViewBuilder
    private func segment(_ segment: WidgetSegment) -> some View {
        switch segment {
        case .liftDone:
            Capsule().fill(color(Palette.lifting))
        case .runDone:
            Capsule().fill(color(Palette.running))
        case .bothDone:
            HStack(spacing: 0) {
                color(Palette.lifting)
                color(Palette.running)
            }
            .clipShape(Capsule())
        case .plannedLift, .plannedBoth:
            Capsule().strokeBorder(color(Palette.lifting).opacity(0.7), lineWidth: 1.5)
        case .plannedRun:
            Capsule().strokeBorder(color(Palette.running).opacity(0.7), lineWidth: 1.5)
        case .missed:
            Capsule().strokeBorder(
                Color.primary.opacity(0.3),
                style: StrokeStyle(lineWidth: 1.5, dash: [2, 2])
            )
        case .rest:
            Capsule().fill(WidgetPalette.track)
        case .before:
            Capsule().fill(WidgetPalette.track.opacity(0.5))
        }
    }
}

/// A ring that runs down as a figure is used: the calorie ring's left mode
/// (CalorieRing.tsx), the arc the food orange and the track a faint grey.
/// Past the target, the track is spent and a deeper orange lap shows how
/// far over: a second lap, not a failure.
struct DrainingRing: View {
    /// What is left, 0...1.
    let left: Double
    /// How far past the target, 0...1, or 0.
    let over: Double
    let lineWidth: CGFloat
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        ZStack {
            Circle().stroke(WidgetPalette.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0, min(left, 1)))
                .stroke(arc(Palette.food), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            if over > 0 {
                Circle()
                    .trim(from: 0, to: max(0, min(over, 1)))
                    .stroke(arc(Palette.foodDeep), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        }
    }

    private func arc(_ color: Color) -> Color {
        mode == .fullColor ? color : .primary
    }
}

/// A thin bar for a figure against its target: protein, water.
struct TargetBar: View {
    let fraction: Double
    let color: Color
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(WidgetPalette.track)
                Capsule()
                    .fill(mode == .fullColor ? color : .primary)
                    .frame(width: geometry.size.width * max(0, min(fraction, 1)))
                    .widgetAccentable()
            }
        }
        .frame(height: 5)
    }
}

/// What a widget shows before the app has written anything, or when what
/// it wrote is for another day: where to go, in the app's own words.
struct OpenTroposNote: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Tropos")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(text)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(4)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
