import WidgetKit
import SwiftUI
import LiveActivitiesKit

/// The widget extension's entry point.
///
/// - The Live Activities Tropos shows on the Lock Screen and in the
///   Dynamic Island: a run while it records (src/lib/runLiveActivity.ts)
///   and a lift from its first set to its finish
///   (src/lib/liftLiveActivity.ts). The plugin's one widget draws both
///   from the layout the app sends when it starts each card, so they need
///   no layout here (Wid2 call 6, its first step). Built to the steps in
///   docs/run-live-activity.md.
/// - The Home Screen and Lock Screen widgets (Wid1, drawn as Wid2 call 5
///   decided): Today, Streak and Today's food, which draw the snapshot the
///   app writes to the App Group (`HomeWidgetSnapshot`).
@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        DynamicActivityWidget()
        TodayWidget()
        StreakWidget()
        FoodWidget()
    }
}
