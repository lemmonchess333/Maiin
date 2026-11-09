import SwiftUI
import WidgetKit

extension RestPayload {
    /// Lifting's glyph while the rest runs, a tick once it is done.
    func symbol(done: Bool) -> String {
        done ? "checkmark.circle.fill" : "dumbbell.fill"
    }

    /// The rest band's own words.
    func title(done: Bool) -> String {
        done ? "Rest done" : "Rest"
    }

    /// Purple while the rest runs, green once it is done: green is status.
    func accent(done: Bool) -> Color {
        done ? Palette.done : Palette.lifting
    }
}

/// The rest's Lock Screen card, as the workout's rest band draws it: the
/// time left as the one display figure, the next set beside it, and a bar
/// running down under them.
///
/// "Done" is the activity going stale: the app makes the rest's end the
/// activity's stale date, and the system draws the card again then, with no
/// update from the app, which may be asleep.
struct RestCard: View {
    let rest: RestPayload
    let done: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            StatusLine(
                symbol: rest.symbol(done: done),
                title: rest.title(done: done),
                color: rest.accent(done: done)
            )
            RestFigures(rest: rest, done: done, heroSize: 48)
            RestProgress(rest: rest, done: done)
        }
    }
}

/// The countdown, and the next set beside it.
struct RestFigures: View {
    let rest: RestPayload
    let done: Bool
    let heroSize: CGFloat

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RestCountdown(rest: rest, done: done, size: heroSize)
                .frame(maxWidth: .infinity, alignment: .leading)
            NextSet(rest: rest)
                .layoutPriority(1)
        }
    }
}

/// The time left, counted by the system to the rest's end, so it keeps time
/// with the app asleep. The wide heavy italic is the rest band's display cut
/// (Archivo's in the app, the system's here), and the figure stays in the
/// text colour, as it does there.
struct RestCountdown: View {
    let rest: RestPayload
    let done: Bool
    let size: CGFloat

    var body: some View {
        Group {
            if done {
                Text("0:00")
            } else {
                Text(timerInterval: rest.interval, countsDown: true, showsHours: false)
            }
        }
        .font(.system(size: size, weight: .heavy).width(.expanded).italic().monospacedDigit())
        .foregroundStyle(Palette.text)
        .multilineTextAlignment(.leading)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

/// What the rest leads to: the exercise, then the set and its load,
/// "Set 2 · 15 kg × 10".
struct NextSet: View {
    let rest: RestPayload

    var body: some View {
        VStack(alignment: .trailing, spacing: 3) {
            if !rest.exercise.isEmpty {
                Text("Next · \(rest.exercise)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.muted)
            }
            if !rest.nextSet.isEmpty {
                Text(rest.nextSet)
                    .font(.system(size: 16, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Palette.text)
            }
        }
        .lineLimit(1)
        .multilineTextAlignment(.trailing)
        .frame(maxWidth: 180, alignment: .trailing)
        .accessibilityElement(children: .combine)
    }
}

/// The rest running down, as the band's ring empties: purple to the end,
/// then whole and green once the rest is done.
struct RestProgress: View {
    let rest: RestPayload
    let done: Bool

    var body: some View {
        if done {
            ProgressView(value: 1.0)
                .tint(Palette.done)
        } else {
            ProgressView(timerInterval: rest.interval, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(Palette.lifting)
        }
    }
}
