import Capacitor

/// Registers the app-owned native bridge before the web view starts loading.
/// Capacitor's package scanner only discovers package plugins, not classes in
/// the application target.
@objc(TroposBridgeViewController)
final class TroposBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WatchRunPlugin())
    }
}
