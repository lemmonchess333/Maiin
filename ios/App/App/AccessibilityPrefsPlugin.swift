import Capacitor
import Foundation
import UIKit

/// The phone's Reduce Transparency setting, for the web view. WebKit does
/// not support the `prefers-reduced-transparency` media query (WebKit bug
/// 175497), so a page in WKWebView cannot see the setting by itself, and
/// every frosted surface's solid fallback (DESIGN_GUIDE §14o, DS6) would
/// never apply on iPhone. It reports the setting and each change to it and
/// decides nothing: `src/lib/reducedTransparency.ts` is the other side, and
/// marks the page so the stylesheet draws those surfaces solid.
/// Registered by `TroposBridgeViewController`.
@objc(AccessibilityPrefsPlugin)
final class AccessibilityPrefsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AccessibilityPrefsPlugin"
    let jsName = "AccessibilityPrefs"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    private static let event = "change"

    override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reduceTransparencyChanged),
            name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// `{ reduceTransparency: Bool }`, read on the main queue as UIKit asks.
    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(Self.prefs())
        }
    }

    @objc private func reduceTransparencyChanged() {
        DispatchQueue.main.async {
            self.notifyListeners(Self.event, data: Self.prefs())
        }
    }

    private static func prefs() -> [String: Any] {
        ["reduceTransparency": UIAccessibility.isReduceTransparencyEnabled]
    }
}
