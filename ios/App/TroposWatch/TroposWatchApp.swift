import SwiftUI

@main
struct TroposWatchApp: App {
    @StateObject private var model = WatchRunModel()

    var body: some Scene {
        WindowGroup {
            WatchRunView(model: model)
        }
    }
}
