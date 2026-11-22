import Combine
import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

/// The live step of a structured run, as the phone's session player decides
/// it and `watchRunStep.ts` writes it. The Watch draws it and buzzes when it
/// moves on; it never times or advances a step itself.
struct WatchRunStep: Equatable {
    let index: Int
    let total: Int
    let eyebrow: String?
    let headline: String?
    let effort: String?
    let remainingSeconds: Double?
    let remainingMeters: Double?
    let progress: Double?
    let next: String?
    let haptic: String?

    var isComplete: Bool { index >= total }

    /// The bounds the phone's bridge already checks. Anything else is no
    /// step at all, never a guessed one.
    init?(_ value: Any?) {
        guard let value = value as? [String: Any],
              let total = value["total"] as? Int, (1...200).contains(total),
              let index = value["index"] as? Int, (0...total).contains(index) else { return nil }
        func text(_ key: String) -> String? {
            guard let text = value[key] as? String, !text.isEmpty, text.count <= 64 else { return nil }
            return text
        }
        func figure(_ key: String, _ range: ClosedRange<Double>) -> Double? {
            guard let number = value[key] as? Double, number.isFinite, range.contains(number) else { return nil }
            return number
        }
        self.index = index
        self.total = total
        eyebrow = text("eyebrow")
        headline = text("headline")
        next = text("next")
        effort = (value["effort"] as? String).flatMap { ["work", "easy", "recovery"].contains($0) ? $0 : nil }
        haptic = (value["haptic"] as? String).flatMap { ["start", "stop", "next", "done"].contains($0) ? $0 : nil }
        remainingSeconds = figure("remainingSeconds", 0...86_400)
        remainingMeters = figure("remainingMeters", 0...100_000)
        progress = figure("progress", 0...1)
    }
}

final class WatchRunModel: NSObject, ObservableObject, WCSessionDelegate, HKWorkoutSessionDelegate {
    @Published private(set) var sessionId: String?
    @Published private(set) var phase = "idle"
    @Published private(set) var saveStatus: String?
    @Published private(set) var revision = 0
    @Published private(set) var elapsedSeconds = 0.0
    @Published private(set) var distanceMeters = 0.0
    @Published private(set) var paceSecondsPerKm: Double?
    /// Written in the runner's unit on the phone ("1.25 mi", "8:03 /mi").
    @Published private(set) var distanceLabel: String?
    @Published private(set) var paceLabel: String?
    @Published private(set) var step: WatchRunStep?
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
    /// The unit the phone last wrote, for a snapshot that came without labels.
    private var usesMiles = false
    private let activeMaxAge: TimeInterval = 6 * 60 * 60
    private let reviewMaxAge: TimeInterval = 7 * 24 * 60 * 60
    private var lastStepHaptic: Date?
    /// Apple asks for no rapid run of haptics, and each one stops heart rate
    /// collection while it plays. A Tropos heuristic: steps skipped faster
    /// than this on the phone buzz once.
    private let stepHapticSpacing: TimeInterval = 1.5

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

    var distanceText: String {
        if let label = distanceLabel { return label }
        return usesMiles
            ? String(format: "%.2f mi", distanceMeters / 1609.344)
            : String(format: "%.2f km", distanceMeters / 1000)
    }

    var paceText: String {
        if let label = paceLabel { return label }
        guard let value = paceSecondsPerKm, value.isFinite, value > 0 else { return "—" }
        let seconds = Int((usesMiles ? value * 1.609344 : value).rounded())
        return String(format: "%d:%02d %@", seconds / 60, seconds % 60, usesMiles ? "/mi" : "/km")
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
        distanceLabel = nil
        paceLabel = nil
        step = nil
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
                step = nil
            }
            let nextStep = newPhase == "review" ? nil : WatchRunStep(value["step"])
            // A step the phone moved on to buzzes once. The first step of a
            // run, a Watch app relaunched mid-run and a replayed older
            // snapshot (a lower index) all show the step without one.
            if let previous = step, let incoming = nextStep,
               incoming.total == previous.total, incoming.index > previous.index {
                playStepHaptic(incoming.haptic)
            }
            step = nextStep
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
            if let label = value["distanceLabel"] as? String, label.count <= 24 {
                distanceLabel = label
                usesMiles = label.hasSuffix(" mi")
            } else {
                distanceLabel = nil
            }
            paceLabel = (value["paceLabel"] as? String).flatMap { $0.count <= 24 ? $0 : nil }
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
                if phase == "review" {
                    step = nil
                    stopHeartRate()
                }
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
    // Apple's "Running workout sessions" asks the app that runs one to
    // request sharing workouts as well as the types it reads, so both are
    // asked for together; the Watch's usage text says it saves none.
    private func startHeartRate() {
        guard HKHealthStore.isHealthDataAvailable(),
              let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            message = "Heart rate unavailable"
            return
        }
        healthStore.requestAuthorization(
            toShare: [HKObjectType.workoutType()], read: [heartRateType]
        ) { [weak self] _, _ in
            DispatchQueue.main.async { self?.beginHeartRate(heartRateType) }
        }
    }

    private func beginHeartRate(_ heartRateType: HKQuantityType) {
        guard let owner = sessionId, phase != "review", workoutSession == nil else { return }
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
            ) { [weak self] _, samples, _, _, _ in self?.consume(samples, sessionId: owner) }
            query.updateHandler = { [weak self] _, samples, _, _, _ in self?.consume(samples, sessionId: owner) }
            heartRateQuery = query
            healthStore.execute(query)
        } catch {
            message = "Heart rate unavailable"
        }
    }

    /// Runs on HealthKit's queue, so it reads only the session it was started
    /// for, never the published state the main queue owns. A query for an
    /// older session is stopped before a new one starts.
    private func consume(_ samples: [HKSample]?, sessionId: String) {
        guard let samples = samples as? [HKQuantitySample] else { return }
        for sample in samples {
            let bpm = sample.quantity.doubleValue(for: .count().unitDivided(by: .minute()))
            guard bpm.isFinite, (30...250).contains(bpm) else { continue }
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
                guard self?.sessionId == sessionId else { return }
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

    /// One haptic at the start of a step: up into a rep or a run, down into
    /// a recovery, a walk or the cool-down, a nudge between steps of the same
    /// effort, success when every step is done (`WatchStepHaptic`). Apple's
    /// `play(_:)` notes that HealthKit stops collecting heart rate while the
    /// haptic plays; one short buzz per step is a gap the run summary's
    /// time-weighting already bounds. In the background it plays only while
    /// the workout session runs.
    private func playStepHaptic(_ haptic: String?) {
        let type: WKHapticType
        switch haptic {
        case "start": type = .start
        case "stop": type = .stop
        case "next": type = .notification
        case "done": type = .success
        default: return
        }
        let now = Date()
        if let last = lastStepHaptic, now.timeIntervalSince(last) < stepHapticSpacing { return }
        lastStepHaptic = now
        WKInterfaceDevice.current().play(type)
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
            guard let self = self else { return }
            self.phoneReachable = session.isReachable
            self.expireLocalStateIfNeeded()
            guard self.sessionId != nil, self.phase != "review" else { return }
            if !session.isReachable {
                self.message = "Phone disconnected"
            } else if self.lastUpdate.map({ Date().timeIntervalSince($0) > 15 }) ?? true {
                // Reachable again, with nothing fresh yet: the controls stay
                // off until the phone's next snapshot clears this line.
                self.message = "Reconnecting to iPhone…"
            }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { receive(applicationContext) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) { receive(userInfo) }
}
