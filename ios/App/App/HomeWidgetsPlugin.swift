import Capacitor
import Foundation
import WidgetKit

/// The web view's way to the Home Screen and Lock Screen widgets (Wid1),
/// as `WatchRunPlugin` is its way to the Watch. It keeps the snapshot the
/// app writes in the App Group the widget extension reads
/// (`HomeWidgetStore`), asks WidgetKit to redraw, and hands the app the
/// drinks the food widget's "+" queued. `src/lib/homeWidgets.ts` is the
/// other side; registered by `TroposBridgeViewController`.
@objc(HomeWidgetsPlugin)
final class HomeWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "HomeWidgetsPlugin"
    let jsName = "HomeWidgets"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getQueuedDrinks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeQueuedDrinks", returnType: CAPPluginReturnPromise)
    ]

    /// The snapshot is a few kilobytes; anything far larger is not one.
    private static let maxSnapshotBytes = 64 * 1024
    /// The shortest gap between two redraws the app asks for. Home writes
    /// the snapshot as its figures land, several times in a second on
    /// opening; WidgetKit needs to hear only the last.
    private static let reloadInterval: TimeInterval = 10

    private var lastReload = Date.distantPast
    private var reloadScheduled = false

    @objc func writeSnapshot(_ call: CAPPluginCall) {
        guard let text = call.getString("snapshot"),
              let data = text.data(using: .utf8),
              data.count <= Self.maxSnapshotBytes,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["version"] as? Int == 1 else {
            call.reject("Invalid widget snapshot")
            return
        }
        guard HomeWidgetStore.writeSnapshot(data) else {
            call.reject("The App Group is not available")
            return
        }
        reloadWidgets()
        call.resolve()
    }

    @objc func clearSnapshot(_ call: CAPPluginCall) {
        HomeWidgetStore.clearSnapshot()
        reloadWidgets()
        call.resolve()
    }

    @objc func getQueuedDrinks(_ call: CAPPluginCall) {
        let drinks = HomeWidgetStore.queuedDrinks()
        let readable = Set(drinks.map(\.id))
        var listed: [[String: Any]] = drinks.map { drink -> [String: Any] in
            [
                "id": drink.id,
                "account": drink.account,
                "date": drink.date,
                "ml": drink.ml,
                "at": drink.at
            ]
        }
        // An entry that does not decode is listed by its id alone, so the
        // app can clear it rather than leave it in the queue for ever.
        for id in HomeWidgetStore.queuedDrinkIds() where !readable.contains(id) {
            listed.append(["id": id])
        }
        call.resolve(["drinks": listed])
    }

    @objc func removeQueuedDrinks(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self) else {
            call.reject("ids is required")
            return
        }
        HomeWidgetStore.removeDrinks(ids: ids)
        // The water the food widget draws now comes from the snapshot alone.
        reloadWidgets()
        call.resolve()
    }

    /// Asks WidgetKit to redraw, at most once every `reloadInterval`: a
    /// request inside it is held until the interval ends, and the latest
    /// snapshot is what that redraw reads.
    private func reloadWidgets() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let wait = Self.reloadInterval - Date().timeIntervalSince(self.lastReload)
            if wait <= 0 {
                self.lastReload = Date()
                WidgetCenter.shared.reloadAllTimelines()
                return
            }
            guard !self.reloadScheduled else { return }
            self.reloadScheduled = true
            DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
                guard let self else { return }
                self.reloadScheduled = false
                self.lastReload = Date()
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
