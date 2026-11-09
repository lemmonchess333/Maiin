import Capacitor
import Foundation
import UIKit
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
        CAPPluginMethod(name: "writeSections", returnType: CAPPluginReturnPromise),
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

    override func load() {
        // A redraw held by the throttle is asked for at once when the app
        // goes to the background: suspended, it would wait for the next open.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reloadHeldRedraw),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    @objc private func reloadHeldRedraw() {
        guard reloadScheduled else { return }
        reloadScheduled = false
        lastReload = Date()
        WidgetCenter.shared.reloadAllTimelines()
    }

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

    /// The sections written on their own (`HomeWidgetSections` in
    /// homeWidgetContract.ts): Food's calories and protein, and today's water.
    static let sectionKeys = ["food", "water"]

    /// Merges the sections named into the snapshot kept for their account,
    /// leaving every other part as Home last wrote it. With no snapshot for
    /// that account (none written yet, or another account's), it starts a
    /// bare one: no days, so Today and Streak say to open the app, and a
    /// time of 0, so they are drawn as old. The plugin's calls run one at a
    /// time, so a whole snapshot and a section never interleave.
    @objc func writeSections(_ call: CAPPluginCall) {
        guard let text = call.getString("sections"),
              let data = text.data(using: .utf8),
              data.count <= Self.maxSnapshotBytes,
              let sections = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let account = sections["account"] as? String, !account.isEmpty else {
            call.reject("Invalid widget sections")
            return
        }
        var snapshot = Self.emptySnapshot(account: account)
        if let stored = HomeWidgetStore.snapshotData(),
           let object = try? JSONSerialization.jsonObject(with: stored) as? [String: Any],
           object["version"] as? Int == 1,
           object["account"] as? String == account {
            snapshot = object
        }
        for key in Self.sectionKeys where sections.keys.contains(key) {
            snapshot[key] = sections[key]
        }
        guard let merged = try? JSONSerialization.data(withJSONObject: snapshot),
              HomeWidgetStore.writeSnapshot(merged) else {
            call.reject("The App Group is not available")
            return
        }
        reloadWidgets()
        call.resolve()
    }

    /// A snapshot with nothing in it but the account, in the shape the
    /// widgets decode.
    static func emptySnapshot(account: String) -> [String: Any] {
        [
            "version": 1,
            "writtenAt": 0,
            "account": account,
            "days": [Any](),
            "week": NSNull(),
            "streak": NSNull(),
            "food": NSNull(),
            "water": NSNull()
        ]
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
                // Already asked for, on the way to the background.
                guard let self, self.reloadScheduled else { return }
                self.reloadScheduled = false
                self.lastReload = Date()
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
