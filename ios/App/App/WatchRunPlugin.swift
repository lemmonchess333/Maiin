import Capacitor
import Foundation

@objc(WatchRunPlugin)
final class WatchRunPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "WatchRunPlugin"
    let jsName = "WatchRun"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "publishSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingCommands", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingHeartRates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isWorkoutWriteAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWorkoutWriteAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestWorkoutWritePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWorkoutExportStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise)
    ]

    private let coordinator = WatchRunCoordinator.shared
    private let workouts = HealthWorkoutStore()
    private var releaseEnabled: Bool {
        Bundle.main.object(forInfoDictionaryKey: "TroposConnectedTrainingEnabled") as? String == "YES"
    }

    override func load() {
        coordinator.onEvent = { [weak self] event, payload in
            self?.notifyListeners(event, data: payload, retainUntilConsumed: true)
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(coordinator.status())
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("enabled is required")
            return
        }
        guard coordinator.setEnabled(enabled) else {
            call.reject("Unable to retain Watch preference")
            return
        }
        call.resolve(coordinator.status())
    }

    @objc func publishSnapshot(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty,
              let revision = call.getInt("revision"), revision >= 0,
              let phase = call.getString("phase"), ["running", "paused", "review"].contains(phase),
              let elapsedSeconds = call.getDouble("elapsedSeconds"), elapsedSeconds.isFinite, elapsedSeconds >= 0,
              let distanceMeters = call.getDouble("distanceMeters"), distanceMeters.isFinite, distanceMeters >= 0,
              let recordedAtMs = call.getDouble("recordedAtMs"), recordedAtMs.isFinite,
              recordedAtMs > 0, recordedAtMs < 8.64e15 else {
            call.reject("Invalid run snapshot")
            return
        }
        var snapshot: [String: Any] = [
            "sessionId": sessionId,
            "revision": revision,
            "phase": phase,
            "elapsedSeconds": elapsedSeconds,
            "distanceMeters": distanceMeters,
            "recordedAtMs": recordedAtMs
        ]
        if let pace = call.getDouble("paceSecondsPerKm"), pace.isFinite, pace >= 0 {
            snapshot["paceSecondsPerKm"] = pace
        }
        if let saveStatus = call.getString("saveStatus") {
            guard phase == "review", ["queued", "synced"].contains(saveStatus) else {
                call.reject("Invalid run save status")
                return
            }
            snapshot["saveStatus"] = saveStatus
        }
        guard coordinator.publish(snapshot) else {
            call.reject("Watch snapshot was not accepted")
            return
        }
        call.resolve()
    }

    @objc func acknowledgeCommand(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty,
              let commandId = call.getString("commandId"), !commandId.isEmpty,
              let revision = call.getInt("revision"), revision >= 0,
              let phase = call.getString("phase"), !phase.isEmpty,
              let accepted = call.getBool("accepted") else {
            call.reject("Invalid Watch command acknowledgment")
            return
        }
        var acknowledgment: [String: Any] = [
            "sessionId": sessionId,
            "commandId": commandId,
            "revision": revision,
            "phase": phase,
            "accepted": accepted
        ]
        if let reason = call.getString("reason") { acknowledgment["reason"] = reason }
        guard coordinator.acknowledge(acknowledgment) else {
            call.reject("Command is no longer pending")
            return
        }
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        guard coordinator.clear(call.getString("sessionId")) else {
            call.reject("Unable to clear Watch session")
            return
        }
        call.resolve(coordinator.status())
    }

    @objc func getPendingCommands(_ call: CAPPluginCall) {
        call.resolve(["commands": coordinator.pendingCommands()])
    }

    @objc func getPendingHeartRates(_ call: CAPPluginCall) {
        call.resolve(["samples": coordinator.pendingHeartRates()])
    }

    @objc func isWorkoutWriteAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": releaseEnabled && workouts.isAvailable])
    }

    @objc func getWorkoutWriteAuthorization(_ call: CAPPluginCall) {
        call.resolve(["status": workouts.writeAuthorization])
    }

    @objc func requestWorkoutWritePermission(_ call: CAPPluginCall) {
        guard releaseEnabled else {
            call.unavailable("Connected training is not enabled in this build")
            return
        }
        workouts.requestAuthorization { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let granted): call.resolve(["granted": granted])
                case .failure(let error): call.reject("Unable to request Apple Health workout access", nil, error)
                }
            }
        }
    }

    @objc func getWorkoutExportStatus(_ call: CAPPluginCall) {
        guard let runId = call.getString("runId"), !runId.isEmpty else {
            call.reject("runId is required")
            return
        }
        workouts.status(runId: runId) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let value): call.resolve(value)
                case .failure(let error): call.reject("Unable to check Apple Health workout", nil, error)
                }
            }
        }
    }

    @objc func exportWorkout(_ call: CAPPluginCall) {
        guard releaseEnabled else {
            call.unavailable("Connected training is not enabled in this build")
            return
        }
        guard let runId = call.getString("runId"), !runId.isEmpty,
              let revision = call.getString("revision"), !revision.isEmpty,
              let startMs = call.getDouble("startMs"), startMs.isFinite, startMs > 0, startMs < 8.64e15,
              let endMs = call.getDouble("endMs"), endMs.isFinite, endMs > startMs, endMs < 8.64e15,
              let durationSeconds = call.getDouble("durationSeconds"), durationSeconds.isFinite,
              durationSeconds > 0, durationSeconds <= 604_800,
              durationSeconds <= (endMs - startMs) / 1000 + 2,
              let distanceMeters = call.getDouble("distanceMeters"), distanceMeters.isFinite,
              (0...1e8).contains(distanceMeters) else {
            call.reject("Invalid Apple Health workout")
            return
        }
        let energyKcal = call.getDouble("energyKcal")
        if let energyKcal = energyKcal, (!energyKcal.isFinite || !(0...1e7).contains(energyKcal)) {
            call.reject("Invalid workout energy")
            return
        }
        workouts.export(
            runId: runId, revision: revision, startMs: startMs, endMs: endMs,
            durationSeconds: durationSeconds,
            distanceMeters: distanceMeters, energyKcal: energyKcal
        ) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let value): call.resolve(value)
                case .failure(let error): call.reject("Unable to export Apple Health workout", nil, error)
                }
            }
        }
    }

    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let runId = call.getString("runId"), !runId.isEmpty else {
            call.reject("runId is required")
            return
        }
        workouts.delete(runId: runId) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let value): call.resolve(value)
                case .failure(let error): call.reject("Unable to delete Apple Health workout", nil, error)
                }
            }
        }
    }
}
