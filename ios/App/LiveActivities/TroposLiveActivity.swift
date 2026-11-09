import ActivityKit
import LiveActivitiesKit
import SwiftUI
import WidgetKit

/// Tropos's Live Activity: a run, and the rest between a lift's sets, on the
/// Lock Screen and in the Dynamic Island.
///
/// The app starts every activity through `capacitor-live-activities`, whose
/// attributes type is its own `DynamicActivityAttributes` (from the plugin's
/// `LiveActivitiesKit`, linked here through Swift Package Manager). ActivityKit
/// gives an activity to the widget configured for its attributes type, so this
/// is the one widget for that type, and the plugin's `DynamicActivityWidget`,
/// which draws a JSON layout sent by the app, is not in the bundle. Drawn here
/// from the content state's data, the rest's countdown and bar are the
/// system's own and tick with the app asleep.
///
/// The extension's deployment target is iOS 16.2, the plugin's floor and the
/// one Polish2 call 1 set, so the ActivityKit API used here (16.1 and 16.2)
/// needs no runtime check. The app keeps iOS 15.4; there the system never
/// loads this extension.
struct TroposLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DynamicActivityAttributes.self) { context in
            LockScreenView(
                payload: LiveActivityPayload(context.state.data),
                done: context.isStale
            )
            .activityBackgroundTint(Palette.surface)
            .activitySystemActionForegroundColor(Palette.text)
        } dynamicIsland: { context in
            let payload = LiveActivityPayload(context.state.data)
            let done = context.isStale
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeading(payload: payload, done: done)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottom(payload: payload, done: done)
                }
            } compactLeading: {
                CompactLeading(payload: payload, done: done)
            } compactTrailing: {
                CompactTrailing(payload: payload, done: done)
            } minimal: {
                CompactLeading(payload: payload, done: done)
            }
            .keylineTint(payload.accent(done: done))
        }
    }
}

/// The app's colours, as `src/lib/theme.ts` holds them (pinned by
/// `liveActivityContract.test.ts`). The card is always dark, as the run
/// screen is: a Live Activity sits on the wallpaper, not in the app's theme.
/// Every colour the Live Activity draws as text measures at least 4.6:1 on
/// the surface. The Home Screen widgets draw the last three as fills only.
enum Palette {
    /// THEME.surface, the app's dark card.
    static let surface = Color(rgb: 0x17171B)
    /// The dark theme's text.
    static let text = Color(rgb: 0xF4F4F6)
    /// Captions and units: 5.5:1 on the surface.
    static let muted = Color(rgb: 0x8E8E93)
    /// THEME.running, coral.
    static let running = Color(rgb: 0xD4637A)
    /// THEME.lifting, purple.
    static let lifting = Color(rgb: 0x7B72E9)
    /// THEME.success, green: a rest that is done.
    static let done = Color(rgb: 0x4DB872)
    /// THEME.semantic.nutrition, the food orange: the Home Screen food
    /// widget's calorie ring and protein bar. A fill, never text.
    static let food = Color(rgb: 0xD9884E)
    /// THEME.calorieRing.deep: the ring's lap past the target.
    static let foodDeep = Color(rgb: 0xA34B08)
    /// THEME.semantic.hydration, teal: the food widget's water.
    static let water = Color(rgb: 0x52A3BD)
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
}

extension LiveActivityPayload {
    /// The colour of the activity's sport, or of a rest that is done.
    func accent(done: Bool) -> Color {
        switch self {
        case .run(let run):
            return run.accent
        case .rest:
            return done ? Palette.done : Palette.lifting
        case .unknown:
            return Palette.muted
        }
    }
}

/// The Lock Screen card, which is also the banner a phone without a Dynamic
/// Island shows.
struct LockScreenView: View {
    let payload: LiveActivityPayload
    let done: Bool

    var body: some View {
        Group {
            switch payload {
            case .run(let run):
                RunCard(run: run)
            case .rest(let rest):
                RestCard(rest: rest, done: done)
            case .unknown:
                AppName()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// The expanded Dynamic Island's top left: the sport and the state.
struct ExpandedLeading: View {
    let payload: LiveActivityPayload
    let done: Bool

    var body: some View {
        switch payload {
        case .run(let run):
            StatusLabel(symbol: RunPayload.symbol, title: run.label, color: run.accent)
        case .rest(let rest):
            StatusLabel(
                symbol: rest.symbol(done: done),
                title: rest.title(done: done),
                color: rest.accent(done: done)
            )
        case .unknown:
            AppName()
        }
    }
}

/// The expanded Dynamic Island's figures, as the card draws them, smaller.
struct ExpandedBottom: View {
    let payload: LiveActivityPayload
    let done: Bool

    var body: some View {
        switch payload {
        case .run(let run):
            RunFigures(run: run, heroSize: 36, metricSize: 20)
                .padding(.horizontal, 4)
        case .rest(let rest):
            VStack(spacing: 8) {
                RestFigures(rest: rest, done: done, heroSize: 38)
                RestProgress(rest: rest, done: done)
            }
            .padding(.horizontal, 4)
        case .unknown:
            EmptyView()
        }
    }
}

/// The compact island's left, and the minimal island: the sport's glyph.
struct CompactLeading: View {
    let payload: LiveActivityPayload
    let done: Bool

    var body: some View {
        switch payload {
        case .run(let run):
            Image(systemName: RunPayload.symbol)
                .foregroundStyle(run.accent)
        case .rest(let rest):
            Image(systemName: rest.symbol(done: done))
                .foregroundStyle(rest.accent(done: done))
        case .unknown:
            EmptyView()
        }
    }
}

/// The compact island's right: the run's time, or the rest's countdown.
struct CompactTrailing: View {
    let payload: LiveActivityPayload
    let done: Bool

    var body: some View {
        switch payload {
        case .run(let run):
            Text(run.elapsed)
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(run.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        case .rest(let rest):
            if done {
                Text("Done")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.done)
            } else {
                // A timer's text takes the width of its longest reading, so it
                // gets a fixed one, its figures to the right.
                Text(timerInterval: rest.interval, countsDown: true, showsHours: false)
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Palette.text)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: 46, alignment: .trailing)
            }
        case .unknown:
            EmptyView()
        }
    }
}

/// A card's first line: the sport's glyph and the activity's state, in its
/// colour, then the app's name.
struct StatusLine: View {
    let symbol: String
    let title: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            StatusLabel(symbol: symbol, title: title, color: color)
            Spacer(minLength: 8)
            Text("Tropos")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.muted)
        }
    }
}

/// The sport's glyph and the activity's state, in its colour.
struct StatusLabel: View {
    let symbol: String
    let title: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: symbol)
            Text(title)
                .lineLimit(1)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(color)
    }
}

/// What a state the widget cannot read shows.
struct AppName: View {
    var body: some View {
        Text("Tropos")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Palette.muted)
    }
}
