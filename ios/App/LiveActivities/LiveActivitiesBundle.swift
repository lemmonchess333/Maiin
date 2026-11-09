import SwiftUI
import WidgetKit

/// The widget extension's entry point. It holds one widget, Tropos's Live
/// Activity, which draws a run and the rest between a lift's sets
/// (docs/run-live-activity.md). There is no Home Screen widget.
@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        TroposLiveActivity()
    }
}
