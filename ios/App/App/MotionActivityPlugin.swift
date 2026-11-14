import Capacitor
import CoreMotion
import Foundation

/// The phone's motion sensors for a run's auto-pause. It passes CoreMotion's
/// readings to the web run engine as they come and decides nothing: the
/// decision, which also reads GPS, is `src/lib/runAutoPause.ts`, and the
/// shape it reads is `parseMotionSample` in `src/lib/runMotionSource.ts`.
///
/// - The pedometer's pause and resume events, which Apple built for a
///   running app's auto-pause (WWDC16 session 713), on iPhone 6s and later.
/// - Pedometer updates: the steps since `start` and the cadence in steps a
///   second, delivered while steps are being taken.
/// - The activity classifier's answer each time it changes, with its
///   confidence.
///
/// Starting it the first time asks for Motion & Fitness, with the reason
/// in Info.plist's `NSMotionUsageDescription` (CoreMotion ends the app
/// without it). CoreMotion stops delivering while the app is suspended; a
/// run keeps the app running in the background through its location
/// updates, so the readings keep coming with the screen locked.
@objc(MotionActivityPlugin)
final class MotionActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "MotionActivityPlugin"
    let jsName = "MotionActivity"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private static let event = "motionSample"

    private let activityManager = CMMotionActivityManager()
    private let pedometer = CMPedometer()
    private let activityQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "app.tropos.motion-activity"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()
    /// Read and written on the main queue only.
    private var running = false

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.startUpdates())
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopUpdates()
            call.resolve()
        }
    }

    deinit {
        activityManager.stopActivityUpdates()
        pedometer.stopUpdates()
        pedometer.stopEventUpdates()
    }

    /// Main queue. Returns what the phone has, for the web side's logs.
    private func startUpdates() -> [String: Any] {
        let status = CMMotionActivityManager.authorizationStatus()
        let result: [String: Any] = [
            "activity": CMMotionActivityManager.isActivityAvailable(),
            "steps": CMPedometer.isStepCountingAvailable(),
            "cadence": CMPedometer.isCadenceAvailable(),
            "events": CMPedometer.isPedometerEventTrackingAvailable(),
            "authorization": Self.name(of: status)
        ]
        if running { return result }
        if status == .denied || status == .restricted {
            emit(["kind": "unavailable"])
            return result
        }
        running = true
        if CMMotionActivityManager.isActivityAvailable() {
            activityManager.startActivityUpdates(to: activityQueue) { [weak self] activity in
                guard let activity = activity else { return }
                self?.emit([
                    "kind": "activity",
                    "at": Self.epochMs(activity.startDate),
                    "confidence": activity.confidence.rawValue,
                    "stationary": activity.stationary,
                    "walking": activity.walking,
                    "running": activity.running,
                    "automotive": activity.automotive,
                    "cycling": activity.cycling,
                    "unknown": activity.unknown
                ])
            }
        }
        if CMPedometer.isStepCountingAvailable() {
            pedometer.startUpdates(from: Date()) { [weak self] data, error in
                if error != nil {
                    // Refused (or the sensor failed): no step evidence, so
                    // auto-pause falls back to GPS.
                    self?.emit(["kind": "unavailable"])
                    return
                }
                guard let data = data else { return }
                var sample: [String: Any] = [
                    "kind": "steps",
                    "at": Self.epochMs(data.endDate),
                    "steps": data.numberOfSteps.intValue
                ]
                if let cadence = data.currentCadence?.doubleValue, cadence.isFinite, cadence >= 0 {
                    sample["cadence"] = cadence
                }
                self?.emit(sample)
            }
        }
        if CMPedometer.isPedometerEventTrackingAvailable() {
            pedometer.startEventUpdates { [weak self] event, error in
                guard error == nil, let event = event else { return }
                self?.emit([
                    "kind": "stepEvent",
                    "at": Self.epochMs(event.date),
                    "moving": event.type == .resume
                ])
            }
        }
        return result
    }

    /// Main queue.
    private func stopUpdates() {
        guard running else { return }
        running = false
        activityManager.stopActivityUpdates()
        pedometer.stopUpdates()
        pedometer.stopEventUpdates()
    }

    /// CoreMotion calls back on its own queues; the bridge is reached from
    /// the main queue, in the order the readings arrived. A reading that
    /// lands after `stop` is dropped; `unavailable` always goes.
    private func emit(_ sample: [String: Any]) {
        let unavailable = (sample["kind"] as? String) == "unavailable"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.running || unavailable else { return }
            self.notifyListeners(Self.event, data: sample)
        }
    }

    private static func epochMs(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded()
    }

    private static func name(of status: CMAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
}
