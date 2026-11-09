import SwiftUI
import WidgetKit

extension RunPayload {
    /// Running's glyph.
    static let symbol = "figure.run"

    /// Coral while the run records, grey while it is paused: the HUD greys
    /// its time the same way, since a stopped clock in coral reads as running.
    var accent: Color {
        paused ? Palette.muted : Palette.running
    }
}

/// The run's Lock Screen card: the state, then the time as the hero with
/// distance and pace beside it.
struct RunCard: View {
    let run: RunPayload

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            StatusLine(symbol: RunPayload.symbol, title: run.label, color: run.accent)
            RunFigures(run: run, heroSize: 46, metricSize: 22)
        }
    }
}

/// The run's figures, as the HUD ranks them: the time is the hero, in the
/// run's colour; distance and pace are white beside it, their units smaller.
/// The app sends each one formatted, a few seconds apart at most, and each
/// change rolls its digits.
struct RunFigures: View {
    let run: RunPayload
    let heroSize: CGFloat
    let metricSize: CGFloat

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(run.elapsed)
                    .font(.system(size: heroSize, weight: .heavy).monospacedDigit())
                    .foregroundStyle(run.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText())
                Text("Time")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.muted)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                Metric(label: run.distance, size: metricSize)
                Metric(label: run.pace, size: metricSize)
            }
            .layoutPriority(1)
        }
    }
}

/// A figure and its unit on one baseline: "3.4" in white, "km" smaller and
/// grey beside it.
struct Metric: View {
    let label: String
    let size: CGFloat

    var body: some View {
        let parts = figureAndUnit(label)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(parts.figure)
                .font(.system(size: size, weight: .bold).monospacedDigit())
                .foregroundStyle(Palette.text)
                .contentTransition(.numericText())
            if !parts.unit.isEmpty {
                Text(parts.unit)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.muted)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .combine)
    }
}
