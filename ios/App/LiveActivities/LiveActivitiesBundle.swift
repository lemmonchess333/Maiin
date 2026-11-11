import WidgetKit
import SwiftUI
import LiveActivitiesKit

/// The Live Activities Tropos shows on the Lock Screen and in the Dynamic
/// Island: a run while it records (src/lib/runLiveActivity.ts) and a lift's
/// rest between sets (src/lib/restLiveActivity.ts). The plugin's one widget
/// draws both from the layout the app sends when it starts each activity,
/// so the extension holds no layout of its own. Built to the steps in
/// docs/run-live-activity.md.
@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        DynamicActivityWidget()
    }
}
