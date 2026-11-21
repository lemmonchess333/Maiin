import UIKit
import Capacitor
import FirebaseAuth

/// The app's one window scene. Apps built with the iOS 27 SDK "must adopt
/// the scene-based life cycle or they fail to launch" (iOS & iPadOS 27
/// Release Notes), and on the iPhone Duo a fold resizes this scene rather
/// than replacing it (docs/ios/iphone-duo.md).
///
/// The window and its root, `TroposBridgeViewController`, still come from
/// the Main storyboard (`UISceneStoryboardFile` in Info.plist), so the web
/// view starts exactly as it did under the app delegate. The rest goes to
/// Capacitor's `SceneDelegateProxy`, which posts the notifications the app
/// delegate's handlers posted, so a plugin listening for an opened URL or
/// a universal link hears it as before, on a cold start too (the proxy
/// holds a launch URL until the web view has appeared).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // A redirect back to Firebase Auth that launched the app.
        for context in connectionOptions.urlContexts {
            _ = Auth.auth().canHandle(context.url)
        }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Firebase Auth's own redirects are its, as they were in the app
        // delegate's open-URL handler, which stops running under scenes.
        let others = URLContexts.filter { !Auth.auth().canHandle($0.url) }
        guard !others.isEmpty else { return }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: others)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
