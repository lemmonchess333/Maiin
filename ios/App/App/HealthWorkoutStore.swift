import Foundation
import HealthKit

private enum HealthWorkoutStoreError: LocalizedError {
    case unavailable
    case permissionRequired
    case operationPending
    case duplicateSamples
    case foreignSample
    case unverifiedSample
    case invalidWorkout

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Apple Health is unavailable on this device."
        case .permissionRequired: return "Allow Tropos to save workouts in Apple Health."
        case .operationPending: return "A workout operation is already in progress."
        case .duplicateSamples: return "Multiple matching Apple Health workouts need review."
        case .foreignSample: return "The matching workout is not owned by Tropos."
        case .unverifiedSample: return "The prior workout cannot be verified. Check Apple Health access before retrying."
        case .invalidWorkout: return "This run cannot be exported to Apple Health."
        }
    }
}

/// One HealthKit workout per canonical Tropos run. The web layer must call this
/// only after a server-confirmed save and explicit workout-write opt-in.
final class HealthWorkoutStore {
    private let store = HKHealthStore()
    private let workoutType = HKObjectType.workoutType()
    private let metadataRunId = "com.tropos.runId"
    private let metadataRevision = "com.tropos.runRevision"
    private let metadataFingerprint = "com.tropos.runFingerprint"
    private let localMapKey = "TroposHealthWorkoutIds"
    private let lock = NSLock()
    private var inFlight: Set<String> = []

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    var writeAuthorization: String {
        guard isAvailable else { return "notDetermined" }
        switch store.authorizationStatus(for: workoutType) {
        case .sharingAuthorized: return "authorized"
        case .sharingDenied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }

    func requestAuthorization(_ completion: @escaping (Result<Bool, Error>) -> Void) {
        guard isAvailable else { completion(.failure(HealthWorkoutStoreError.unavailable)); return }
        store.requestAuthorization(toShare: [workoutType], read: [workoutType]) { _, error in
            if let error = error { completion(.failure(error)); return }
            // HealthKit can report write access. It deliberately does not
            // disclose whether read access was denied.
            completion(.success(self.store.authorizationStatus(for: self.workoutType) == .sharingAuthorized))
        }
    }

    func status(runId: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard isAvailable else { completion(.failure(HealthWorkoutStoreError.unavailable)); return }
        lookup(runId: runId) { result in
            switch result {
            case .failure(let error): completion(.failure(error))
            case .success(let workout):
                if let workout = workout {
                    completion(.success([
                        "status": "present",
                        "workoutId": workout.uuid.uuidString,
                        "revision": workout.metadata?[self.metadataRevision] as? String ?? ""
                    ]))
                } else if let localId = self.localMap()[runId] {
                    // A denied read grant looks like an empty query. Preserve
                    // the local receipt rather than reporting false absence.
                    completion(.success(["status": "unverified", "workoutId": localId]))
                } else {
                    completion(.success(["status": "absent"]))
                }
            }
        }
    }

    func export(
        runId: String,
        revision: String,
        startMs: Double,
        endMs: Double,
        durationSeconds: Double,
        distanceMeters: Double,
        energyKcal: Double?,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        guard begin(runId) else { completion(.failure(HealthWorkoutStoreError.operationPending)); return }
        let finish: (Result<[String: Any], Error>) -> Void = { result in
            self.end(runId)
            completion(result)
        }
        guard isAvailable else { finish(.failure(HealthWorkoutStoreError.unavailable)); return }
        // The fingerprint below converts values to Int64. A malformed
        // user-owned run must fail closed rather than overflow the app.
        guard startMs.isFinite, endMs.isFinite,
              startMs >= 946_684_800_000, endMs <= 4_102_444_800_000,
              endMs > startMs,
              durationSeconds.isFinite, durationSeconds > 0,
              durationSeconds <= 604_800,
              durationSeconds <= (endMs - startMs) / 1000 + 2,
              distanceMeters.isFinite, (0...1_000_000).contains(distanceMeters),
              energyKcal.map({ $0.isFinite && (0...100_000).contains($0) }) ?? true else {
            finish(.failure(HealthWorkoutStoreError.invalidWorkout)); return
        }
        guard store.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            finish(.failure(HealthWorkoutStoreError.permissionRequired)); return
        }

        let fingerprint = "\(Int64(startMs.rounded())):\(Int64(endMs.rounded())):\(Int64((durationSeconds * 1000).rounded())):\(Int64((distanceMeters * 1000).rounded())):\(energyKcal.map { Int64(($0 * 1000).rounded()) } ?? -1)"
        lookup(runId: runId) { result in
            switch result {
            case .failure(let error): finish(.failure(error))
            case .success(let existing):
                if let existing = existing {
                    if (existing.metadata?[self.metadataFingerprint] as? String) == fingerprint &&
                       (existing.metadata?[self.metadataRevision] as? String) == revision {
                        self.remember(runId: runId, workoutId: existing.uuid.uuidString)
                        finish(.success(["status": "present", "workoutId": existing.uuid.uuidString, "revision": revision]))
                    } else {
                        // HealthKit samples are immutable. Never write a
                        // replacement until the app-owned old sample is gone.
                        self.store.delete(existing) { deleted, error in
                            if let error = error { finish(.failure(error)); return }
                            guard deleted else { finish(.failure(HealthWorkoutStoreError.permissionRequired)); return }
                            self.forget(runId: runId)
                            self.save(
                                runId: runId, revision: revision, startMs: startMs, endMs: endMs,
                                durationSeconds: durationSeconds,
                                distanceMeters: distanceMeters, energyKcal: energyKcal,
                                fingerprint: fingerprint,
                                syncVersion: (existing.metadata?[HKMetadataKeySyncVersion] as? Int ?? 1) + 1,
                                completion: finish
                            )
                        }
                    }
                } else if self.localMap()[runId] != nil {
                    // The user may have denied read access. An unverified
                    // "absent" result must not produce a duplicate workout.
                    finish(.failure(HealthWorkoutStoreError.unverifiedSample))
                } else {
                    self.save(
                        runId: runId, revision: revision, startMs: startMs, endMs: endMs,
                        durationSeconds: durationSeconds,
                        distanceMeters: distanceMeters, energyKcal: energyKcal,
                        fingerprint: fingerprint, syncVersion: 1, completion: finish
                    )
                }
            }
        }
    }

    func delete(runId: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard begin(runId) else { completion(.failure(HealthWorkoutStoreError.operationPending)); return }
        let finish: (Result<[String: Any], Error>) -> Void = { result in
            self.end(runId)
            completion(result)
        }
        guard isAvailable else { finish(.failure(HealthWorkoutStoreError.unavailable)); return }
        guard store.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            finish(.failure(HealthWorkoutStoreError.permissionRequired)); return
        }
        lookup(runId: runId) { result in
            switch result {
            case .failure(let error): finish(.failure(error))
            case .success(let workout):
                guard let workout = workout else {
                    // A prior local receipt with no readable Health sample is
                    // not proof of deletion: keep it for a later retry.
                    if self.localMap()[runId] != nil {
                        finish(.failure(HealthWorkoutStoreError.permissionRequired))
                    } else {
                        finish(.success(["status": "absent"]))
                    }
                    return
                }
                self.store.delete(workout) { deleted, error in
                    if let error = error { finish(.failure(error)); return }
                    guard deleted else { finish(.failure(HealthWorkoutStoreError.permissionRequired)); return }
                    self.forget(runId: runId)
                    finish(.success(["status": "deleted"]))
                }
            }
        }
    }

    private func lookup(runId: String, completion: @escaping (Result<HKWorkout?, Error>) -> Void) {
        let predicate = HKQuery.predicateForObjects(withMetadataKey: metadataRunId, allowedValues: [runId])
        let query = HKSampleQuery(
            sampleType: workoutType,
            predicate: predicate,
            limit: 2,
            sortDescriptors: nil
        ) { _, samples, error in
            if let error = error { completion(.failure(error)); return }
            guard let workouts = samples as? [HKWorkout] else { completion(.success(nil)); return }
            guard workouts.count <= 1 else { completion(.failure(HealthWorkoutStoreError.duplicateSamples)); return }
            if let workout = workouts.first,
               workout.sourceRevision.source.bundleIdentifier != Bundle.main.bundleIdentifier {
                completion(.failure(HealthWorkoutStoreError.foreignSample))
            } else {
                completion(.success(workouts.first))
            }
        }
        store.execute(query)
    }

    private func save(
        runId: String,
        revision: String,
        startMs: Double,
        endMs: Double,
        durationSeconds: Double,
        distanceMeters: Double,
        energyKcal: Double?,
        fingerprint: String,
        syncVersion: Int,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        let energy = energyKcal.map { HKQuantity(unit: .kilocalorie(), doubleValue: $0) }
        let workout = HKWorkout(
            activityType: .running,
            start: Date(timeIntervalSince1970: startMs / 1000),
            end: Date(timeIntervalSince1970: endMs / 1000),
            // HealthKit's interval still spans the real start/end, while
            // duration follows the phone timer and excludes pauses.
            duration: min(durationSeconds, (endMs - startMs) / 1000),
            totalEnergyBurned: energy,
            totalDistance: HKQuantity(unit: .meter(), doubleValue: distanceMeters),
            metadata: [
                metadataRunId: runId,
                metadataRevision: revision,
                metadataFingerprint: fingerprint,
                HKMetadataKeySyncIdentifier: "tropos.run.\(runId)",
                HKMetadataKeySyncVersion: syncVersion
            ]
        )
        store.save(workout) { saved, error in
            if let error = error { completion(.failure(error)); return }
            guard saved else { completion(.failure(HealthWorkoutStoreError.permissionRequired)); return }
            self.remember(runId: runId, workoutId: workout.uuid.uuidString)
            completion(.success(["status": "created", "workoutId": workout.uuid.uuidString, "revision": revision]))
        }
    }

    private func begin(_ runId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !inFlight.contains(runId) else { return false }
        inFlight.insert(runId)
        return true
    }

    private func end(_ runId: String) {
        lock.lock()
        inFlight.remove(runId)
        lock.unlock()
    }

    private func localMap() -> [String: String] {
        UserDefaults.standard.dictionary(forKey: localMapKey) as? [String: String] ?? [:]
    }

    private func remember(runId: String, workoutId: String) {
        lock.lock()
        var map = localMap()
        map[runId] = workoutId
        UserDefaults.standard.set(map, forKey: localMapKey)
        lock.unlock()
    }

    private func forget(runId: String) {
        lock.lock()
        var map = localMap()
        map.removeValue(forKey: runId)
        UserDefaults.standard.set(map, forKey: localMapKey)
        lock.unlock()
    }
}
