import Foundation
import WatchConnectivity

/// The phone owns the run. This class only moves snapshots and commands across
/// WatchConnectivity and retains unhandled input until the web run engine acks it.
final class WatchRunCoordinator: NSObject, WCSessionDelegate {
    static let shared = WatchRunCoordinator()

    var onEvent: ((String, [String: Any]) -> Void)?

    private let lock = NSRecursiveLock()
    private var snapshot: [String: Any]?
    private var commands: [[String: Any]] = []
    private var heartRates: [[String: Any]] = []
    private var enabled = false
    private var retiredSessionIds: [String] = []
    private let maxRetiredSessionIds = 64
    // Shared by applicationContext and sendMessage. Persist it before either
    // channel sends so delayed messages cannot resurrect an older session.
    private var transportGeneration = 0.0
    private let maxCommands = 32
    // One representative sample per five-second bucket covers a six-hour run
    // in the protected recovery file without rewriting it for every beat.
    private let maxHeartRates = 5000
    private let maxSeenHeartRateIds = 24000
    private var seenHeartRateIds: Set<String> = []
    private var seenHeartRateOrder: [String] = []
    private var restoredHeartRateBuckets: Set<Int64> = []
    private let activeMaxAgeMs = 6.0 * 60 * 60 * 1000
    private let reviewMaxAgeMs = 7.0 * 24 * 60 * 60 * 1000
    private var releaseEnabled: Bool {
        Bundle.main.object(forInfoDictionaryKey: "TroposConnectedTrainingEnabled") as? String == "YES"
    }

    private var stateURL: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("TroposWatchRun", isDirectory: true)
            .appendingPathComponent("state.json")
    }

    private override init() {
        super.init()
        restore()
        if !releaseEnabled {
            retireSession(snapshot?["sessionId"] as? String)
            enabled = false
            snapshot = nil
            commands.removeAll()
            heartRates.removeAll()
            seenHeartRateIds.removeAll()
            seenHeartRateOrder.removeAll()
            restoredHeartRateBuckets.removeAll()
            advanceTransportGeneration()
            _ = persist()
        }
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func status() -> [String: Any] {
        _ = expireStaleSession()
        lock.lock()
        defer { lock.unlock() }
        let available = releaseEnabled && WCSession.isSupported()
        var result: [String: Any] = [
            "available": available,
            "paired": available && WCSession.default.isPaired,
            "installed": available && WCSession.default.isWatchAppInstalled,
            "reachable": available && WCSession.default.isReachable,
            "enabled": enabled
        ]
        if let sessionId = snapshot?["sessionId"] as? String,
           let phase = snapshot?["phase"] as? String,
           phase == "running" || phase == "paused" {
            result["activeSessionId"] = sessionId
        }
        return result
    }

    @discardableResult func setEnabled(_ value: Bool) -> Bool {
        if value && !releaseEnabled { return false }
        lock.lock()
        let previousEnabled = enabled
        let previousSnapshot = snapshot
        let previousRetiredSessionIds = retiredSessionIds
        let previousCommands = commands
        let previousHeartRates = heartRates
        let previousSeenHeartRateIds = seenHeartRateIds
        let previousSeenHeartRateOrder = seenHeartRateOrder
        let previousRestoredBuckets = restoredHeartRateBuckets
        let previousTransportGeneration = transportGeneration
        enabled = value
        if !value {
            retireSession(snapshot?["sessionId"] as? String)
            snapshot = nil
            commands.removeAll()
            heartRates.removeAll()
            seenHeartRateIds.removeAll()
            seenHeartRateOrder.removeAll()
            restoredHeartRateBuckets.removeAll()
            advanceTransportGeneration()
        }
        guard persist() else {
            enabled = previousEnabled
            snapshot = previousSnapshot
            retiredSessionIds = previousRetiredSessionIds
            commands = previousCommands
            heartRates = previousHeartRates
            seenHeartRateIds = previousSeenHeartRateIds
            seenHeartRateOrder = previousSeenHeartRateOrder
            restoredHeartRateBuckets = previousRestoredBuckets
            transportGeneration = previousTransportGeneration
            lock.unlock()
            return false
        }
        if !value { send(["kind": "clear"]) }
        lock.unlock()
        emitStatus()
        return true
    }

    func publish(_ newSnapshot: [String: Any]) -> Bool {
        lock.lock()
        guard releaseEnabled && enabled,
              let incomingSessionId = newSnapshot["sessionId"] as? String,
              !incomingSessionId.isEmpty,
              !retiredSessionIds.contains(incomingSessionId) else {
            lock.unlock()
            return false
        }
        if let current = snapshot,
           (current["sessionId"] as? String) == (newSnapshot["sessionId"] as? String) {
            let currentRevision = current["revision"] as? Int ?? -1
            let nextRevision = newSnapshot["revision"] as? Int ?? -1
            let currentPhase = current["phase"] as? String ?? ""
            let nextPhase = newSnapshot["phase"] as? String ?? ""
            let currentSaveRank = saveRank(current["saveStatus"] as? String)
            let nextSaveRank = saveRank(newSnapshot["saveStatus"] as? String)
            let currentTime = current["recordedAtMs"] as? Double ?? 0
            let nextTime = newSnapshot["recordedAtMs"] as? Double ?? 0
            // A delayed web publish must never return a finished run to
            // recording, or replace a local/server save receipt with an
            // earlier state. Phase changes require a new session revision.
            if nextRevision < currentRevision ||
                (nextRevision == currentRevision && nextPhase != currentPhase) ||
                (currentPhase == "review" && nextPhase != "review") ||
                nextSaveRank < currentSaveRank ||
                (nextRevision == currentRevision && nextTime < currentTime) {
                lock.unlock()
                return false
            }
        }
        let previousSnapshot = snapshot
        let previousRetiredSessionIds = retiredSessionIds
        let previousCommands = commands
        let previousHeartRates = heartRates
        let previousSeenHeartRateIds = seenHeartRateIds
        let previousSeenHeartRateOrder = seenHeartRateOrder
        let previousRestoredBuckets = restoredHeartRateBuckets
        let previousTransportGeneration = transportGeneration
        snapshot = newSnapshot
        advanceTransportGeneration()
        // Old commands can never act on a newly started session.
        let sessionId = incomingSessionId
        if previousSnapshot?["sessionId"] as? String != sessionId {
            retireSession(previousSnapshot?["sessionId"] as? String)
        }
        commands.removeAll { ($0["sessionId"] as? String) != sessionId }
        heartRates.removeAll { ($0["sessionId"] as? String) != sessionId }
        if previousSnapshot?["sessionId"] as? String != sessionId {
            seenHeartRateIds.removeAll()
            seenHeartRateOrder.removeAll()
            restoredHeartRateBuckets.removeAll()
        }
        if newSnapshot["saveStatus"] as? String != nil {
            // Summary has already consumed the beats. Keep only the small
            // saved/syncing status on the Watch, never raw samples or old
            // controls after the phone accepts a durable Save.
            commands.removeAll()
            heartRates.removeAll()
            seenHeartRateIds.removeAll()
            seenHeartRateOrder.removeAll()
            restoredHeartRateBuckets.removeAll()
        }
        guard persist() else {
            snapshot = previousSnapshot
            retiredSessionIds = previousRetiredSessionIds
            commands = previousCommands
            heartRates = previousHeartRates
            seenHeartRateIds = previousSeenHeartRateIds
            seenHeartRateOrder = previousSeenHeartRateOrder
            restoredHeartRateBuckets = previousRestoredBuckets
            transportGeneration = previousTransportGeneration
            lock.unlock()
            return false
        }
        send(["kind": "snapshot", "snapshot": newSnapshot])
        lock.unlock()
        emitStatus()
        return true
    }

    private func saveRank(_ value: String?) -> Int {
        switch value {
        case "queued": return 1
        case "synced": return 2
        default: return 0
        }
    }

    @discardableResult func clear(_ sessionId: String?) -> Bool {
        lock.lock()
        if let sessionId = sessionId,
           sessionId != (snapshot?["sessionId"] as? String) {
            // A clear can outrun the first web snapshot, or arrive after a
            // newer run started. Retire its ID without erasing that newer
            // run. When native has no session, send a versioned clear so an
            // old Watch display is removed as well.
            let previousRetiredSessionIds = retiredSessionIds
            let previousTransportGeneration = transportGeneration
            retireSession(sessionId)
            if snapshot == nil { advanceTransportGeneration() }
            guard persist() else {
                retiredSessionIds = previousRetiredSessionIds
                transportGeneration = previousTransportGeneration
                lock.unlock()
                return false
            }
            if snapshot == nil { send(["kind": "clear"]) }
            lock.unlock()
            return true
        }
        let previousEnabled = enabled
        let previousSnapshot = snapshot
        let previousRetiredSessionIds = retiredSessionIds
        let previousCommands = commands
        let previousHeartRates = heartRates
        let previousSeenHeartRateIds = seenHeartRateIds
        let previousSeenHeartRateOrder = seenHeartRateOrder
        let previousRestoredBuckets = restoredHeartRateBuckets
        let previousTransportGeneration = transportGeneration
        snapshot = nil
        retireSession(previousSnapshot?["sessionId"] as? String)
        advanceTransportGeneration()
        commands.removeAll()
        heartRates.removeAll()
        seenHeartRateIds.removeAll()
        seenHeartRateOrder.removeAll()
        restoredHeartRateBuckets.removeAll()
        if sessionId == nil { enabled = false }
        guard persist() else {
            enabled = previousEnabled
            snapshot = previousSnapshot
            retiredSessionIds = previousRetiredSessionIds
            commands = previousCommands
            heartRates = previousHeartRates
            seenHeartRateIds = previousSeenHeartRateIds
            seenHeartRateOrder = previousSeenHeartRateOrder
            restoredHeartRateBuckets = previousRestoredBuckets
            transportGeneration = previousTransportGeneration
            lock.unlock()
            return false
        }
        send(["kind": "clear"])
        lock.unlock()
        emitStatus()
        return true
    }

    func pendingCommands() -> [[String: Any]] {
        _ = expireStaleSession()
        lock.lock()
        defer { lock.unlock() }
        let nowMs = Date().timeIntervalSince1970 * 1000
        return commands.filter { ($0["expiresAtMs"] as? Double ?? 0) > nowMs }
    }

    func pendingHeartRates() -> [[String: Any]] {
        _ = expireStaleSession()
        lock.lock()
        defer { lock.unlock() }
        return heartRates
    }

    func acknowledge(_ acknowledgment: [String: Any]) -> Bool {
        guard let commandId = acknowledgment["commandId"] as? String,
              let sessionId = acknowledgment["sessionId"] as? String else { return false }
        lock.lock()
        guard let index = commands.firstIndex(where: {
            ($0["commandId"] as? String) == commandId &&
            ($0["sessionId"] as? String) == sessionId
        }) else {
            lock.unlock()
            return false
        }
        let command = commands.remove(at: index)
        guard persist() else {
            commands.insert(command, at: index)
            lock.unlock()
            return false
        }
        lock.unlock()
        send(["kind": "ack", "ack": acknowledgment])
        return true
    }

    private func accept(_ payload: [String: Any], replyHandler: (([String: Any]) -> Void)? = nil) {
        _ = expireStaleSession()
        guard let kind = payload["kind"] as? String else {
            replyHandler?(["received": false])
            return
        }
        switch kind {
        case "command":
            guard let command = payload["command"] as? [String: Any],
                  let sessionId = command["sessionId"] as? String,
                  let commandId = command["commandId"] as? String,
                  let action = command["action"] as? String,
                  ["pause", "resume", "end"].contains(action),
                  let expectedRevision = command["expectedRevision"] as? Int else {
                replyHandler?(["received": false])
                return
            }
            lock.lock()
            let currentId = snapshot?["sessionId"] as? String
            let currentRevision = snapshot?["revision"] as? Int
            let nowMs = Date().timeIntervalSince1970 * 1000
            let previousCommands = commands
            commands.removeAll { ($0["expiresAtMs"] as? Double ?? 0) <= nowMs }
            if commands.count != previousCommands.count && !persist() {
                commands = previousCommands
                lock.unlock()
                replyHandler?(["received": false])
                return
            }
            let isCurrent = releaseEnabled && enabled && sessionId == currentId && expectedRevision == currentRevision
            let isDuplicate = commands.contains { ($0["commandId"] as? String) == commandId }
            if isCurrent && !isDuplicate && commands.count < maxCommands {
                let createdAtMs = nowMs
                let sanitized: [String: Any] = [
                    "sessionId": sessionId,
                    "commandId": commandId,
                    "expectedRevision": expectedRevision,
                    "action": action,
                    "createdAtMs": createdAtMs,
                    "expiresAtMs": createdAtMs + 8_000
                ]
                commands.append(sanitized)
                guard persist() else {
                    commands.removeLast()
                    lock.unlock()
                    replyHandler?(["received": false])
                    return
                }
                lock.unlock()
                emit("watchCommand", sanitized)
                replyHandler?(["received": true])
            } else {
                lock.unlock()
                // A transport receipt is never an acceptance of the action.
                replyHandler?(["received": isDuplicate])
                if !isDuplicate {
                    send(["kind": "ack", "ack": [
                        "sessionId": sessionId,
                        "commandId": commandId,
                        "revision": currentRevision ?? -1,
                        "phase": snapshot?["phase"] ?? "unknown",
                        "accepted": false,
                        "reason": "stale_or_unavailable"
                    ]])
                }
            }
        case "heartRate":
            guard let sample = payload["sample"] as? [String: Any],
                  let sessionId = sample["sessionId"] as? String,
                  let sampleId = sample["sampleId"] as? String,
                  let timestampMs = sample["timestampMs"] as? Double,
                  let bpm = sample["bpm"] as? Double,
                  timestampMs.isFinite, timestampMs > 0, timestampMs < 8.64e15,
                  bpm.isFinite, (30...250).contains(bpm) else {
                replyHandler?(["received": false])
                return
            }
            lock.lock()
            let isCurrent = releaseEnabled && enabled &&
                (snapshot?["sessionId"] as? String) == sessionId &&
                (snapshot?["saveStatus"] as? String) == nil
            let isDuplicate = seenHeartRateIds.contains(sampleId) ||
                heartRates.contains { ($0["sampleId"] as? String) == sampleId }
            let bucket = Int64((timestampMs / 5000).rounded(.down))
            if isCurrent && restoredHeartRateBuckets.contains(bucket) {
                // A sample from a bucket recovered after process death may be
                // a retransmission whose ID was coalesced away. The durable
                // representative already covers this five-second interval.
                lock.unlock()
                replyHandler?(["received": true])
                return
            }
            if isCurrent && !isDuplicate {
                let sanitized: [String: Any] = [
                    "sessionId": sessionId,
                    "sampleId": sampleId,
                    "timestampMs": timestampMs,
                    "bpm": bpm
                ]
                let hasBucket = heartRates.contains {
                    guard let savedMs = $0["timestampMs"] as? Double else { return false }
                    return Int64((savedMs / 5000).rounded(.down)) == bucket
                }
                if !hasBucket {
                    let previousHeartRates = heartRates
                    heartRates.append(sanitized)
                    if heartRates.count > maxHeartRates {
                        heartRates.removeFirst(heartRates.count - maxHeartRates)
                    }
                    guard persist() else {
                        heartRates = previousHeartRates
                        lock.unlock()
                        replyHandler?(["received": false])
                        return
                    }
                }
                seenHeartRateIds.insert(sampleId)
                seenHeartRateOrder.append(sampleId)
                if seenHeartRateOrder.count > maxSeenHeartRateIds {
                    seenHeartRateIds.remove(seenHeartRateOrder.removeFirst())
                }
                lock.unlock()
                emit("heartRateSample", sanitized)
            } else {
                lock.unlock()
            }
            replyHandler?(["received": isCurrent])
        default:
            replyHandler?(["received": false])
        }
    }

    private func send(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.activationState == .activated && session.isWatchAppInstalled {
            var outbound = payload
            if payload["kind"] as? String == "snapshot" || payload["kind"] as? String == "clear" {
                // All callers of state sends hold `lock` while this value is
                // read, so the context and direct message carry one version.
                outbound["transportGeneration"] = transportGeneration
                try? session.updateApplicationContext(outbound)
            } else {
                session.transferUserInfo(outbound)
            }
            if session.isReachable {
                session.sendMessage(outbound, replyHandler: nil, errorHandler: nil)
            }
        }
    }

    private func advanceTransportGeneration() {
        let nowMs = floor(Date().timeIntervalSince1970 * 1000)
        transportGeneration = max(transportGeneration + 1, nowMs)
    }

    private func retireSession(_ sessionId: String?) {
        guard let sessionId = sessionId, !sessionId.isEmpty else { return }
        retiredSessionIds.removeAll { $0 == sessionId }
        retiredSessionIds.append(sessionId)
        if retiredSessionIds.count > maxRetiredSessionIds {
            retiredSessionIds.removeFirst(retiredSessionIds.count - maxRetiredSessionIds)
        }
    }

    private func emit(_ name: String, _ data: [String: Any]) {
        DispatchQueue.main.async { [weak self] in self?.onEvent?(name, data) }
    }

    private func emitStatus() { emit("connectionChanged", status()) }

    private func persist() -> Bool {
        let state: [String: Any] = [
            "enabled": enabled,
            "transportGeneration": transportGeneration,
            "retiredSessionIds": retiredSessionIds,
            "snapshot": snapshot ?? NSNull(),
            "commands": commands,
            "heartRates": heartRates
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: state) else { return false }
        let folder = stateURL.deletingLastPathComponent()
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            // Commands must remain writable with the iPhone locked after its
            // first unlock. A failed atomic write is never acknowledged.
            try data.write(to: stateURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    private func restore() {
        guard let data = try? Data(contentsOf: stateURL),
              let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        enabled = state["enabled"] as? Bool ?? false
        let restoredGeneration = state["transportGeneration"] as? Double ?? 0
        transportGeneration = restoredGeneration.isFinite &&
            restoredGeneration >= 0 && restoredGeneration < 8.64e15
            ? restoredGeneration : 0
        retiredSessionIds = Array((state["retiredSessionIds"] as? [String] ?? []).suffix(maxRetiredSessionIds))
        snapshot = state["snapshot"] as? [String: Any]
        commands = state["commands"] as? [[String: Any]] ?? []
        heartRates = state["heartRates"] as? [[String: Any]] ?? []
        seenHeartRateOrder = heartRates.compactMap { $0["sampleId"] as? String }
        seenHeartRateIds = Set(seenHeartRateOrder)
        restoredHeartRateBuckets = Set(heartRates.compactMap {
            guard let ms = $0["timestampMs"] as? Double,
                  ms.isFinite, ms > 0, ms < 8.64e15 else { return nil }
            return Int64((ms / 5000).rounded(.down))
        })
        // A same-account relaunch may preserve Watch preference, but a stale
        // run and its beats must expire with the phone's recoverable run.
        if !expireStaleSession(), snapshot == nil {
            commands.removeAll()
            heartRates.removeAll()
            seenHeartRateIds.removeAll()
            seenHeartRateOrder.removeAll()
            restoredHeartRateBuckets.removeAll()
        }
    }

    /// Apply the phone's recovery windows while this process is still alive,
    /// too. Incoming Watch events and status reads can wake a stale session.
    private func expireStaleSession() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard let snapshot = snapshot else { return false }
        let recordedAt = snapshot["recordedAtMs"] as? Double ?? 0
        let now = Date().timeIntervalSince1970 * 1000
        let maxAge = snapshot["phase"] as? String == "review"
            ? reviewMaxAgeMs : activeMaxAgeMs
        guard !recordedAt.isFinite || recordedAt <= 0 ||
                recordedAt > now + 60_000 || now - recordedAt > maxAge else { return false }
        self.snapshot = nil
        retireSession(snapshot["sessionId"] as? String)
        advanceTransportGeneration()
        commands.removeAll()
        heartRates.removeAll()
        seenHeartRateIds.removeAll()
        seenHeartRateOrder.removeAll()
        restoredHeartRateBuckets.removeAll()
        _ = persist()
        send(["kind": "clear"])
        return true
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        emitStatus()
        if activationState == .activated {
            _ = expireStaleSession()
            lock.lock()
            if transportGeneration <= 0 {
                advanceTransportGeneration()
                _ = persist()
            }
            if let snapshot = snapshot {
                send(["kind": "snapshot", "snapshot": snapshot])
            } else {
                send(["kind": "clear"])
            }
            lock.unlock()
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) { emitStatus() }
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
        emitStatus()
    }
    func sessionWatchStateDidChange(_ session: WCSession) { emitStatus() }
    func sessionReachabilityDidChange(_ session: WCSession) { emitStatus() }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        accept(message)
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        accept(message, replyHandler: replyHandler)
    }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        accept(userInfo)
    }
}
