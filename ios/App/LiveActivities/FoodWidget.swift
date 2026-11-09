import SwiftUI
import WidgetKit

/// Today's food (Wid1): the calories left as Home's ring counts them down;
/// on a medium widget the protein and water beside it, with a "+" that adds
/// the person's usual drink (iOS 17) and opens the app where water is
/// logged before then; on the Lock Screen a calories-left gauge. A drink
/// added here shows at once, from the App Group, and the app saves it on
/// its next open.
struct FoodWidget: Widget {
    static let kind = "TroposFood"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HomeWidgetProvider()) { entry in
            FoodWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's food")
        .description("Calories left today, with protein and water.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

/// The day's calories as the ring reads them (CalorieRing.tsx): what is
/// left, or how far over, against the day's target.
struct CalorieFigures {
    let eaten: Int
    let target: Int

    var hasTarget: Bool { target > 0 }
    var isOver: Bool { hasTarget && eaten > target }
    /// The ring's arc: what is left of the target.
    var left: Double { hasTarget ? max(0, 1 - Double(eaten) / Double(target)) : 0 }
    /// The deeper lap past the target, one lap at most.
    var over: Double { isOver ? min(Double(eaten - target) / Double(target), 1) : 0 }
    /// The centre's figure: calories left, or over, or logged with no target.
    var figure: Int { hasTarget ? abs(target - eaten) : eaten }
    /// "kcal left", "kcal over", "kcal logged": the ring's label.
    var label: String { !hasTarget ? "kcal logged" : isOver ? "kcal over" : "kcal left" }
}

struct FoodWidgetView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    private var figures: CalorieFigures? {
        entry.snapshot?.food(on: entry.date).map {
            CalorieFigures(eaten: $0.eaten, target: $0.target)
        }
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                FoodGauge(figures: figures)
                    .accessoryCard(disc: false)
            case .systemMedium:
                FoodMedium(entry: entry, figures: figures)
                    .staleMark(entry.foodStale)
                    .homeWidgetCard()
            default:
                FoodSmall(entry: entry, figures: figures)
                    .staleMark(entry.foodStale)
                    .homeWidgetCard()
            }
        }
        .widgetURL(HomeWidgetLinks.food)
    }
}

/// The calorie ring with its figure and label in the middle.
struct CalorieRingView: View {
    let figures: CalorieFigures?
    let lineWidth: CGFloat
    let figureSize: CGFloat

    var body: some View {
        ZStack {
            DrainingRing(left: figures?.left ?? 0, over: figures?.over ?? 0, lineWidth: lineWidth)
            VStack(spacing: 0) {
                if let figures {
                    Text(figures.figure, format: .number)
                        .font(.system(size: figureSize, weight: .heavy).monospacedDigit())
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text(figures.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Text("–")
                        .font(.system(size: figureSize, weight: .heavy))
                        .foregroundStyle(.secondary)
                    Text("Open Tropos")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .padding(.horizontal, lineWidth + 4)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private var accessibility: String {
        guard let figures else { return "Calories. Open Tropos to update today's food." }
        if !figures.hasTarget { return "\(figures.eaten) calories logged" }
        return figures.isOver
            ? "\(figures.figure) calories over today's target"
            : "\(figures.figure) calories left today"
    }
}

struct FoodSmall: View {
    let entry: HomeWidgetEntry
    let figures: CalorieFigures?

    var body: some View {
        if entry.snapshot == nil {
            OpenTroposNote(text: "Open Tropos to see today's food")
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WidgetKicker(symbol: WidgetGlyph.food, title: "Food", color: Palette.food)
                CalorieRingView(figures: figures, lineWidth: 9, figureSize: 24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

struct FoodMedium: View {
    let entry: HomeWidgetEntry
    let figures: CalorieFigures?

    var body: some View {
        if let snapshot = entry.snapshot {
            HStack(spacing: 14) {
                CalorieRingView(figures: figures, lineWidth: 10, figureSize: 26)
                VStack(alignment: .leading, spacing: 9) {
                    ProteinRow(food: snapshot.food(on: entry.date))
                    if let water = snapshot.water {
                        WaterRow(
                            ml: snapshot.waterMl(on: entry.date, queued: entry.drinks),
                            water: water
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            OpenTroposNote(text: "Open Tropos to see today's food")
        }
    }
}

/// Protein against the day's target. Grams unspaced, as the food surface
/// writes them ("62g").
struct ProteinRow: View {
    let food: WidgetFood?

    private var figure: String {
        guard let food else { return "–" }
        return food.proteinTarget > 0 ? "\(food.protein)g of \(food.proteinTarget)g" : "\(food.protein)g"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text("Protein")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                Text(figure)
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            TargetBar(
                fraction: food.map { $0.proteinTarget > 0 ? Double($0.protein) / Double($0.proteinTarget) : 0 } ?? 0,
                color: Palette.food
            )
        }
        .accessibilityElement(children: .combine)
    }
}

/// Water against the day's target, with the "+".
struct WaterRow: View {
    let ml: Int
    let water: WidgetWater

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text("Water")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                Text("\(waterVolume(ml)) of \(waterVolume(water.targetMl))")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            HStack(spacing: 8) {
                TargetBar(
                    fraction: water.targetMl > 0 ? Double(ml) / Double(water.targetMl) : 0,
                    color: Palette.water
                )
                AddDrinkButton(water: water)
            }
        }
    }
}

/// "+ Glass": the person's usual drink, Home's water step. On iOS 17 it
/// queues the drink without opening the app; before that it opens Home,
/// where the water card's "+" logs it.
struct AddDrinkButton: View {
    let water: WidgetWater
    @Environment(\.widgetRenderingMode) private var mode

    private var label: some View {
        HStack(spacing: 2) {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
            Text(water.servingLabel)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 9)
        .frame(minHeight: 26)
        .background {
            Capsule().fill(mode == .fullColor ? Palette.water.opacity(0.22) : Color.primary.opacity(0.15))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Add \(waterVolume(water.servingMl)) of water")
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: LogDrinkIntent(millilitres: water.servingMl)) {
                label
            }
            .buttonStyle(.plain)
        } else {
            Link(destination: HomeWidgetLinks.home) {
                label
            }
        }
    }
}

/// The Lock Screen's gauge: calories left, as a ring that runs down.
struct FoodGauge: View {
    let figures: CalorieFigures?

    var body: some View {
        Gauge(value: figures?.left ?? 0) {
            Image(systemName: WidgetGlyph.food)
        } currentValueLabel: {
            if let figures {
                Text(figures.figure, format: .number)
                    .monospacedDigit()
            } else {
                Text("–")
            }
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
        .accessibilityLabel(
            figures.map { $0.isOver ? "\($0.figure) calories over" : "\($0.figure) calories left" }
                ?? "Calories. Open Tropos to update."
        )
    }
}

struct FoodWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            FoodWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small")
            FoodWidgetView(entry: .firstUse)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small · first use")
            FoodWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium")
            FoodWidgetView(entry: .doneToday)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · a drink queued")
            FoodWidgetView(entry: .stale)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · a day old")
            FoodWidgetView(entry: .sample)
                .previewContext(WidgetPreviewContext(family: .accessoryCircular))
                .previewDisplayName("Lock Screen · gauge")
        }
    }
}
