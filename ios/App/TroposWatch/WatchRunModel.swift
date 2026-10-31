import Combine
import Foundation
import HealthKit
import WatchConnectivity

final class WatchRunModel: NSObject, ObservableObject, WCSessionDelegate, HKWorkoutSessionDelegate {
    @Published private(set) var sessionId: String?
    @Published private(set) var phase = "idle"
    @Published private(set) var saveStatus: String?
    @Published private(set) var revision = 0
    @Published private(set) var elapsedSeconds = 0.0
    @Published private(set) var distanceMeters = 0.0
    @Published private(set) var paceSecondsPerKm: Double?
    @Published private(set) var heartRateBpm: Int?
    @Published private(set) var lastHeartRate: Date?
    @Published private(set) var lastUpdate: Date?
    @Published private(set) var pendingAction: String?
    @Published private(set) var message = "Start a run on your iPhone"
    @Published private(set) var phoneReachable = false

    private let healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var heartRateQuery: HKAnchoredObjectQuery?
    private var pendingCommandId: String?
    private var heartRateStart: Date?
    private let generationKey = "TroposWatchTransportGeneration"
    private var highestTransportGeneration = UserDefaults.standard.double(forKey: "TroposWatchTransportGeneration")
    private var appliedGenerationThisLaunch = false
    private var expiryTimer: Timer?
    private let activeMaxAge: TimeInterval = 6 * 60 * 60
    private let reviewMaxAge: TimeInterval = 7 * 24 * 60 * 60

    override init() {
        super.init()
        if !highestTransportGeneration.isFinite || highestTransportGeneration < 0 {
            highestTransportGeneration = 0
        }
        guard Bundle.main.object(forInfoDictionaryKey: "TroposConnectedTrainingEnabled") as? String == "YES" else {
            message = "Watch runs are coming soon"
            return
        }
        if WCSession.isSupported() {
            let connection = WCSession.default
            connection.delegate = self
            connection.activate()
            if !connection.receivedApplicationContext.isEmpty {
                receive(connection.receivedApplicationContext)
            }
        }
        let timer = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
            self?.expireLocalStateIfNeeded()
        }
        RunLoop.main.add(timer, forMode: .common)
        expiryTimer = timer
    }

    deinit { expiryTimer?.invalidate() }

    var canControl: Bool {
        sessionId != nil && phase != "review" &&
            pendingAction == nil && phoneReachable &&
            lastUpdate.map { Date().timeIntervalSince($0) <= 15 } == true
    }

    var isRunning: Bool { phase == "running" }
    var isPaused: Bool { phase == "paused" }

    func sendCommand(_ action: String) {
        guard canControl, let sessionId = sessionId,
              ["pause", "resume", "end"].contains(action) else { return }
        let commandId = UUID().uuidString
        pendingAction = action
        pendingCommandId = commandId
        message = "Waiting for iPhone…"
        let command: [String: Any] = [
            "sessionId": sessionId,
            "commandId": commandId,
            "expectedRevision": revision,
            "action": action
        ]
        WCSession.default.sendMessage(
            ["kind": "command", "command": command],
            replyHandler: { [weak self] reply in
                guard reply["received"] as? Bool == true else {
                    DispatchQueue.main.async { self?.failCommand(commandId, message: "iPhone unavailable") }
                    return
                }
                // A receipt only says the phone got the bytes. The phone run
                // engine must separately acknowledge the state change.
            },
            errorHandler: { [weak self] _ in
                DispatchQueue.main.async { self?.failCommand(commandId, message: "Phone disconnected") }
            }
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.failCommand(commandId, message: "No phone response")
        }
    }

    private func failCommand(_ commandId: String, message: String) {
        guard pendingCommandId == commandId else { return }
        pendingCommandId = nil
        pendingAction = nil
        self.message = message
    }

    private func receive(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in self?.apply(payload) }
    }

    /// A snapshot and its fast direct copy carry the same generation. The
    /// high-water mark survives a Watch process restart; only the current
    /// application context may replay that generation on the new process.
    private func acceptStateGeneration(_ payload: [String: Any]) -> Bool {
        guard let generation = payload["transportGeneration"] as? Double,
              generation.isFinite, generation > 0, generation < 8.64e15,
              generation >= highestTransportGeneration,
              generation > highestTransportGeneration || !appliedGenerationThisLaunch else {
            return false
        }
        highestTransportGeneration = generation
        appliedGenerationThisLaunch = true
        UserDefaults.standard.set(generation, forKey: generationKey)
        return true
    }

    private func saveRank(_ value: String?) -> Int {
        switch value {
        case "queued": return 1
        case "synced": return 2
        default: return 0
        }
    }

    private func resetLocalState(message: String) {
        stopHeartRate()
        sessionId = nil
        saveStatus = nil
        revision = 0
        phase = "idle"
        pendingAction = nil
        pendingCommandId = nil
        elapsedSeconds = 0
        distanceMeters = 0
        paceSecondsPerKm = nil
        heartRateBpm = nil
        lastHeartRate = nil
        lastUpdate = nil
        self.message = message
    }

    private func expireLocalStateIfNeeded() {
        guard sessionId != nil else { return }
        let maxAge = phase == "review" ? reviewMaxAge : activeMaxAge
        guard let lastUpdate = lastUpdate,
              lastUpdate.timeIntervalSinceNow <= 60,
              Date().timeIntervalSince(lastUpdate) <= maxAge else {
            resetLocalState(message: "Run no longer available")
            return
        }
    }

    private func apply(_ payload: [String: Any]) {
        switch payload["kind"] as? String {
        case "snapshot":
            guard let value = payload["snapshot"] as? [String: Any],
                  let newSessionId = value["sessionId"] as? String,
                  !newSessionId.isEmpty,
                  let newRevision = value["revision"] as? Int,
                  newRevision >= 0,
                  let newPhase = value["phase"] as? String,
                  ["running", "paused", "review"].contains(newPhase),
                  let recordedAtMs = value["recordedAtMs"] as? Double,
                  recordedAtMs.isFinite, recordedAtMs > 0,
                  recordedAtMs < 8.64e15 else { return }
            let nextSaveStatus = value["saveStatus"] as? String
            if let nextSaveStatus = nextSaveStatus {
                guard newPhase == "review", ["queued", "synced"].contains(nextSaveStatus) else { return }
            }
            let isNewSession = newSessionId != sessionId
            if !isNewSession {
                guard newRevision >= revision,
                      !(newRevision == revision && newPhase != phase),
                      !(phase == "review" && newPhase != "review"),
                      saveRank(nextSaveStatus) >= saveRank(saveStatus) else { return }
            }
            guard acceptStateGeneration(payload) else { return }
            let recordedAt = Date(timeIntervalSince1970: recordedAtMs / 1000)
            let maxAge = newPhase == "review" ? reviewMaxAge : activeMaxAge
            if recordedAt.timeIntervalSinceNow > 60 ||
                Date().timeIntervalSince(recordedAt) > maxAge {
                resetLocalState(message: "Run no longer available")
                return
            }
            if isNewSession {
                stopHeartRate()
                heartRateBpm = nil
                lastHeartRate = nil
                pendingAction = nil
                pendingCommandId = nil
                sessionId = newSessionId
                saveStatus = nil
            }
            revision = newRevision
            phase = newPhase
            saveStatus = nextSaveStatus
            if saveStatus != nil {
                pendingAction = nil
                pendingCommandId = nil
            }
            elapsedSeconds = value["elapsedSeconds"] as? Double ?? elapsedSeconds
            distanceMeters = value["distanceMeters"] as? Double ?? distanceMeters
            paceSecondsPerKm = value["paceSecondsPerKm"] as? Double
            lastUpdate = recordedAt
            if saveStatus == "queued" {
                message = "Saved on iPhone · syncing"
            } else if saveStatus == "synced" {
                message = "Synced to Tropos"
            } else {
                message = newPhase == "review" ? "Review and save on iPhone" : ""
            }
            if newPhase == "review" { stopHeartRate() }
            else if isNewSession { startHeartRate() }
        case "ack":
            guard let ack = payload["ack"] as? [String: Any],
                  let commandId = ack["commandId"] as? String,
                  commandId == pendingCommandId,
                  ack["sessionId"] as? String == sessionId else { return }
            pendingCommandId = nil
            pendingAction = nil
            if ack["accepted"] as? Bool == true {
                if let value = ack["revision"] as? Int { revision = max(revision, value) }
                if let value = ack["phase"] as? String { phase = value }
                message = phase == "review" ? "Review and save on iPhone" : ""
                if phase == "review" { stopHeartRate() }
            } else {
                message = "iPhone did not change the run"
            }
        case "clear":
            guard acceptStateGeneration(payload) else { return }
            resetLocalState(message: "Start a run on your iPhone")
        default:
            break
        }
    }

    // A live Watch workout session enables timely sensor readings. We do not
    // attach a builder or call finishWorkout, so this code does not save an
    // Apple Health workout. The paired-device gate must still verify that
    // watchOS creates no sample/activity-ring contribution implicitly.
    private func startHeartRate() {
        guard HKHealthStore.isHealthDataAvailable(),
              let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            message = "Heart rate unavailable"
            return
        }
        healthStore.requestAuthorization(toShare: [], read: [heartRateType]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.beginHeartRate(heartRateType) }
        }
    }

    private func beginHeartRate(_ heartRateType: HKQuantityType) {
        guard sessionId != nil, phase != "review", workoutSession == nil else { return }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .outdoor
        do {
            let workout = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            workout.delegate = self
            workoutSession = workout
            heartRateStart = Date()
            workout.startActivity(with: heartRateStart!)
            let predicate = HKQuery.predicateForSamples(
                withStart: heartRateStart!, end: nil, options: .strictStartDate
            )
            let query = HKAnchoredObjectQuery(
                type: heartRateType, predicate: predicate,
                anchor: nil, limit: HKObjectQueryNoLimit
            ) { [weak self] _, samples, _, _, _ in self?.consume(samples) }
            query.updateHandler = { [weak self] _, samples, _, _, _ in self?.consume(samples) }
            heartRateQuery = query
            healthStore.execute(query)
        } catch {
            message = "Heart rate unavailable"
        }
    }

    private func consume(_ samples: [HKSample]?) {
        guard let samples = samples as? [HKQuantitySample] else { return }
        for sample in samples {
            let bpm = sample.quantity.doubleValue(for: .count().unitDivided(by: .minute()))
            guard bpm.isFinite, (30...250).contains(bpm), let sessionId = sessionId else { continue }
            let payload: [String: Any] = [
                "kind": "heartRate",
                "sample": [
                    "sessionId": sessionId,
                    "sampleId": sample.uuid.uuidString,
                    "timestampMs": sample.startDate.timeIntervalSince1970 * 1000,
                    "bpm": bpm
                ]
            ]
            DispatchQueue.main.async { [weak self] in
                self?.heartRateBpm = Int(bpm.rounded())
                self?.lastHeartRate = sample.startDate
            }
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: { reply in
                    if reply["received"] as? Bool != true {
                        WCSession.default.transferUserInfo(payload)
                    }
                }, errorHandler: { _ in WCSession.default.transferUserInfo(payload) })
            } else {
                WCSession.default.transferUserInfo(payload)
            }
        }
    }

    private func stopHeartRate() {
        if let query = heartRateQuery { healthStore.stop(query) }
        heartRateQuery = nil
        workoutSession?.end()
        workoutSession = nil
        heartRateStart = nil
    }

    func workoutSession(_ workoutSession: HKWorkoutSession,
                        didChangeTo toState: HKWorkoutSessionState,
                        from fromState: HKWorkoutSessionState, date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            guard self?.phase != "review" else { return }
            self?.heartRateBpm = nil
            self?.message = "Heart rate unavailable"
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.phoneReachable = session.isReachable
            self?.expireLocalStateIfNeeded()
        }
        if !session.receivedApplicationContext.isEmpty {
            receive(session.receivedApplicationContext)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            self?.phoneReachable = session.isReachable
            self?.expireLocalStateIfNeeded()
            if !session.isReachable && self?.sessionId != nil && self?.phase != "review" {
                self?.message = "Phone disconnected"
            }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { receive(applicationContext) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) { receive(userInfo) }
}
