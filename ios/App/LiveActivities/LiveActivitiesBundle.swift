import SwiftUI
import WidgetKit

/// The widget extension's entry point: Tropos's Live Activity, which draws a
/// run and the rest between a lift's sets (docs/run-live-activity.md), and
/// the Home Screen and Lock Screen widgets (Wid1): Today, Streak and Today's
/// food, which draw the snapshot the app writes to the App Group
/// (`HomeWidgetSnapshot`).
@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        TroposLiveActivity()
        TodayWidget()
        StreakWidget()
        FoodWidget()
    }
}
