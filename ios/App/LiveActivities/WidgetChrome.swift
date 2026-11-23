import SwiftUI
import UIKit
import WidgetKit

/// The colours the Home Screen and Lock Screen widgets draw with, as the
/// app's own tokens hold them (`src/lib/theme.ts`, `src/index.css`):
/// `homeWidgetContract.test.ts` holds each to its token. Colour is on the
/// person's data only (DS4): purple lifting, coral running, orange food,
/// teal water, the flame in the brand purple.
enum Palette {
    /// THEME.lifting, purple: a fill, never small text.
    static let lifting = Color(rgb: 0x7B72E9)
    /// THEME.running, coral: a fill, never small text.
    static let running = Color(rgb: 0xD4637A)
    /// THEME.success, green: a session done.
    static let done = Color(rgb: 0x4DB872)
    /// THEME.semantic.nutrition, the food orange: the calorie ring and
    /// protein bar. A fill, never text.
    static let food = Color(rgb: 0xD9884E)
    /// THEME.calorieRing.deep: the ring's lap past the target.
    static let foodDeep = Color(rgb: 0xA34B08)
    /// THEME.semantic.hydration, teal: the food widget's water.
    static let water = Color(rgb: 0x52A3BD)
    /// Protein's colour as Food draws it (DS10 call 3): MACROS_LIGHT's
    /// fuchsia by day, THEME.macros.protein's orchid by night. The night
    /// value is under 3:1 on white.
    static let protein = Color(light: 0xA21CAF, dark: 0xEC8AF5)
    /// THEME.purpleRamp 600 and 400: the streak flame's body, from its
    /// base to its tip, as the app's flame draws its first tiers.
    static let flameBase = Color(rgb: 0x6560C8)
    static let flameTip = Color(rgb: 0x9590E0)

    /// Small text in a sport's colour: `--lifting-strong` and
    /// `--running-strong`, the tokens the app sets its own coloured words
    /// in, which hold 4.5:1 on the card by day and by night.
    static let liftingText = Color(light: 0x5548E2, dark: 0x9B93EE)
    static let runningText = Color(light: 0xAC2F48, dark: 0xDF8B9C)
}

extension Color {
    /// A colour from its hex value, 0xRRGGBB, in sRGB.
    init(rgb: UInt32) {
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }

    /// One colour by day and another by night.
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
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

/// The Home Screen widgets' card: white by day and the app's dark card
/// (THEME.surface) by night, as the app's own cards are. The chrome is
/// neutral, the system's text colours on it.
enum WidgetPalette {
    static let card = Color(light: 0xFFFFFF, dark: 0x17171B)

    /// A track or an empty segment: the text colour, faint.
    static let track = Color.primary.opacity(0.12)

    /// A sport's fill: a segment, a light.
    static func sport(_ sport: WidgetSport) -> Color {
        switch sport {
        case .lift, .both: return Palette.lifting
        case .run: return Palette.running
        case .rest, .none: return .secondary
        }
    }

    /// A sport's words: the kicker over a session's name.
    static func sportText(_ sport: WidgetSport) -> Color {
        switch sport {
        case .lift, .both: return Palette.liftingText
        case .run: return Palette.runningText
        case .rest, .none: return .secondary
        }
    }
}

/// The SF Symbol each state is drawn with.
enum WidgetGlyph {
    static func of(_ day: WidgetDay) -> String {
        switch day.state {
        case .done: return "checkmark"
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

/// The soft light a widget's drawing stands in (Wid2 call 5, DS6): the
/// session's colour, about a quarter strong in the corner the drawing
/// stands in, gone before the card's far side. One per widget, never on a
/// rest day, and only where the widget is drawn in colour.
struct SessionLight: View {
    let color: Color

    var body: some View {
        RadialGradient(
            colors: [color.opacity(0.26), color.opacity(0)],
            center: UnitPoint(x: 0.8, y: 0.85),
            startRadius: 0,
            endRadius: 130
        )
    }
}

extension View {
    /// A Home Screen widget's card, with the session's light when it has
    /// one. iOS 17 draws it behind the content with its own margins, and
    /// takes it away in StandBy; iOS 16 has neither, so the content gets
    /// the margins and the colour itself.
    @ViewBuilder
    func homeWidgetCard(light: Color? = nil) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) {
                ZStack {
                    WidgetPalette.card
                    if let light { SessionLight(color: light) }
                }
            }
        } else {
            padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background {
                    ZStack {
                        WidgetPalette.card
                        if let light { SessionLight(color: light) }
                    }
                }
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

/// A session's drawing, one pose of Home's flipbook from the extension's
/// catalog (`liveActivityArt.ts`). Nothing at all for a name the catalog
/// does not hold: a blank, never a placeholder picture.
struct SessionDrawing: View {
    let art: String
    let height: CGFloat

    var body: some View {
        if !art.isEmpty, UIImage(named: art) != nil {
            Image(art)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: height, alignment: .bottom)
                .accessibilityHidden(true)
        }
    }
}

/// The small line over a widget's figure: its glyph and words in the
/// data's colour where colour is drawn, the text colour on the Lock Screen.
struct WidgetKicker: View {
    let symbol: String?
    let title: String
    let color: Color
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        HStack(spacing: 4) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .bold))
            }
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.6)
                .lineLimit(1)
        }
        .foregroundStyle(mode == .fullColor ? color : .primary)
        .widgetAccentable()
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
    /// The weekday letters under the segments.
    var letters = true
    @Environment(\.widgetRenderingMode) private var mode

    private static let weekdays = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<7, id: \.self) { index in
                VStack(spacing: 3) {
                    segment(shown(index))
                        .frame(height: 6)
                        .overlay {
                            if index == today {
                                Capsule().strokeBorder(Color.primary, lineWidth: 1.5)
                            }
                        }
                    if letters {
                        Text(Self.weekdays[index])
                            .font(.system(size: 10, weight: index == today ? .heavy : .semibold))
                            .foregroundStyle(index == today ? Color.primary : Color.secondary)
                    }
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
        .frame(height: 6)
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
