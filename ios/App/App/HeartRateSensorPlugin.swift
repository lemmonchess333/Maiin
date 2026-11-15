import Capacitor
import CoreBluetooth
import Foundation
import UIKit

/// A Bluetooth heart rate sensor (a chest strap or an armband) speaking the
/// standard Heart Rate Service, 0x180D, and its Heart Rate Measurement
/// characteristic, 0x2A37.
///
/// The web layer parses each measurement (`src/lib/heartRateMeasurement.ts`
/// is the one parser); this plugin forwards the bytes, remembers the paired
/// sensor, keeps it connected while a run or Settings wants it, and holds a
/// run's readings in memory so a reloaded web view can recover them at
/// review. Nothing is written to disk but the paired sensor's identifier and
/// name. Creating the central manager is what shows iOS's Bluetooth prompt,
/// so it is created only after a tap (search, pair) or once Bluetooth is
/// already allowed.
@objc(HeartRateSensorPlugin)
final class HeartRateSensorPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    let identifier = "HeartRateSensorPlugin"
    let jsName = "HeartRateSensor"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pair", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSessionReadings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSessions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private static let heartRateService = CBUUID(string: "180D")
    private static let heartRateMeasurement = CBUUID(string: "2A37")
    private static let pairedIdKey = "tropos.heartRateSensor.id"
    private static let pairedNameKey = "tropos.heartRateSensor.name"
    private static let fallbackName = "Heart rate sensor"
    /// Twelve hours at one reading a second (Heart Rate Service 1.0 §3.1.1.5).
    private static let maxReadingsPerSession = 43_200
    /// Runs whose readings are kept at once: the active one and a few that
    /// wait for review.
    private static let maxSessions = 4

    /// Every piece of state below is read and written on this queue, which is
    /// also the central manager's delegate queue.
    private let queue = DispatchQueue(label: "app.tropos.heart-rate-sensor")
    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var discovered: [UUID: CBPeripheral] = [:]
    private var discoveredNames: [UUID: String] = [:]
    private var scanning = false
    private var reconnectScanning = false
    private var previewing = false
    private var activeSessionId: String?
    private var sessions: [String: [[String: Any]]] = [:]
    private var sessionOrder: [String] = []
    private var sequence = 0
    private let bootId = String(UUID().uuidString.prefix(8))
    private var connection = "idle"

    override func load() {
        // Settings' live reading ends when the app leaves the screen; a run
        // keeps its own claim on the sensor.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    @objc private func appDidEnterBackground() {
        queue.async {
            self.previewing = false
            self.scanning = false
            self.refreshScan()
            self.updateConnection()
        }
    }

    // MARK: - Plugin methods

    @objc func getStatus(_ call: CAPPluginCall) {
        queue.async { call.resolve(self.statusPayload()) }
    }

    @objc func startScan(_ call: CAPPluginCall) {
        queue.async {
            self.scanning = true
            self.discovered.removeAll()
            self.discoveredNames.removeAll()
            self.ensureCentral(prompting: true)
            self.refreshScan()
            self.announceConnectedSensors()
            self.emitStatus()
            call.resolve()
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        queue.async {
            self.scanning = false
            self.refreshScan()
            self.emitStatus()
            call.resolve()
        }
    }

    @objc func pair(_ call: CAPPluginCall) {
        guard let raw = call.getString("id"), let id = UUID(uuidString: raw) else {
            call.reject("A sensor id is required")
            return
        }
        queue.async {
            guard let central = self.ensureCentral(prompting: true) else {
                call.reject("Bluetooth is unavailable")
                return
            }
            guard let target = self.discovered[id]
                ?? central.retrievePeripherals(withIdentifiers: [id]).first else {
                call.reject("Sensor not found")
                return
            }
            self.scanning = false
            self.refreshScan()
            if let current = self.peripheral, current.identifier != id {
                central.cancelPeripheralConnection(current)
            }
            let name = self.discoveredNames[id] ?? target.name ?? Self.fallbackName
            UserDefaults.standard.set(id.uuidString, forKey: Self.pairedIdKey)
            UserDefaults.standard.set(name, forKey: Self.pairedNameKey)
            self.peripheral = target
            target.delegate = self
            // Pairing happens on the Settings screen, which shows the reading.
            self.previewing = true
            self.updateConnection()
            self.emitStatus()
            call.resolve(self.statusPayload())
        }
    }

    @objc func forget(_ call: CAPPluginCall) {
        queue.async {
            if let current = self.peripheral {
                self.central?.cancelPeripheralConnection(current)
            }
            self.peripheral = nil
            self.reconnectScanning = false
            self.refreshScan()
            UserDefaults.standard.removeObject(forKey: Self.pairedIdKey)
            UserDefaults.standard.removeObject(forKey: Self.pairedNameKey)
            self.connection = "idle"
            self.emitStatus()
            call.resolve(self.statusPayload())
        }
    }

    @objc func setPreview(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        queue.async {
            self.previewing = on
            self.updateConnection()
            call.resolve()
        }
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty else {
            call.reject("sessionId is required")
            return
        }
        queue.async {
            self.activeSessionId = sessionId
            if self.sessions[sessionId] == nil {
                self.sessions[sessionId] = []
                self.sessionOrder.append(sessionId)
                while self.sessionOrder.count > Self.maxSessions {
                    let oldest = self.sessionOrder.removeFirst()
                    self.sessions.removeValue(forKey: oldest)
                }
            }
            self.updateConnection()
            call.resolve()
        }
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        queue.async {
            self.activeSessionId = nil
            self.updateConnection()
            call.resolve()
        }
    }

    @objc func getSessionReadings(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty else {
            call.reject("sessionId is required")
            return
        }
        queue.async {
            call.resolve(["readings": self.sessions[sessionId] ?? []])
        }
    }

    @objc func clearSessions(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        queue.async {
            if let sessionId = sessionId, !sessionId.isEmpty {
                self.sessions.removeValue(forKey: sessionId)
                self.sessionOrder.removeAll { $0 == sessionId }
                if self.activeSessionId == sessionId { self.activeSessionId = nil }
            } else {
                self.sessions.removeAll()
                self.sessionOrder.removeAll()
                self.activeSessionId = nil
            }
            self.updateConnection()
            call.resolve()
        }
    }

    /// The app's own page in Settings, where Bluetooth is allowed again.
    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("Unable to open app-specific settings")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            call.resolve()
        }
    }

    // MARK: - State (on `queue`)

    private var wantsConnection: Bool { activeSessionId != nil || previewing }

    private func pairedId() -> UUID? {
        guard let raw = UserDefaults.standard.string(forKey: Self.pairedIdKey) else { return nil }
        return UUID(uuidString: raw)
    }

    @discardableResult
    private func ensureCentral(prompting: Bool) -> CBCentralManager? {
        if let central = central { return central }
        guard prompting || CBManager.authorization == .allowedAlways else { return nil }
        let manager = CBCentralManager(
            delegate: self,
            queue: queue,
            options: [CBCentralManagerOptionShowPowerAlertKey: false]
        )
        central = manager
        return manager
    }

    private func refreshScan() {
        guard let central = central, central.state == .poweredOn else { return }
        if scanning || reconnectScanning {
            central.scanForPeripherals(withServices: [Self.heartRateService], options: nil)
        } else if central.isScanning {
            central.stopScan()
        }
    }

    /// A sensor already connected to this iPhone, by another app or the
    /// system, does not advertise, so a search lists it from here.
    private func announceConnectedSensors() {
        guard scanning, let central = central, central.state == .poweredOn else { return }
        for sensor in central.retrieveConnectedPeripherals(withServices: [Self.heartRateService]) {
            discovered[sensor.identifier] = sensor
            let name = sensor.name ?? Self.fallbackName
            discoveredNames[sensor.identifier] = name
            notifyListeners("sensorFound", data: ["id": sensor.identifier.uuidString, "name": name])
        }
    }

    private func updateConnection() {
        guard let id = pairedId(), wantsConnection else {
            if let current = peripheral, current.state != .disconnected {
                central?.cancelPeripheralConnection(current)
            }
            reconnectScanning = false
            refreshScan()
            setConnection("idle")
            return
        }
        guard let central = ensureCentral(prompting: false), central.state == .poweredOn else { return }
        if let current = peripheral, current.identifier == id {
            if current.state == .disconnected {
                setConnection("connecting")
                central.connect(current, options: nil)
            }
            return
        }
        let known = central.retrievePeripherals(withIdentifiers: [id]).first
            ?? central.retrieveConnectedPeripherals(withServices: [Self.heartRateService])
                .first(where: { $0.identifier == id })
        guard let target = known else {
            // Not known to this iPhone now: find it by its advertising.
            reconnectScanning = true
            refreshScan()
            setConnection("connecting")
            return
        }
        peripheral = target
        target.delegate = self
        setConnection("connecting")
        // A connection request does not time out: it completes when the
        // sensor is worn and in range.
        central.connect(target, options: nil)
    }

    private func setConnection(_ next: String) {
        guard connection != next else { return }
        connection = next
        emitStatus()
    }

    private func emitStatus() {
        notifyListeners("statusChanged", data: statusPayload())
    }

    private func statusPayload() -> [String: Any] {
        var payload: [String: Any] = [
            "available": true,
            "authorization": authorizationName(),
            "bluetooth": radioName(),
            "connection": connection,
            "scanning": scanning
        ]
        if let id = UserDefaults.standard.string(forKey: Self.pairedIdKey) {
            payload["paired"] = [
                "id": id,
                "name": UserDefaults.standard.string(forKey: Self.pairedNameKey) ?? Self.fallbackName
            ]
        }
        return payload
    }

    private func authorizationName() -> String {
        switch CBManager.authorization {
        case .allowedAlways: return "allowed"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }

    private func radioName() -> String {
        guard let central = central else { return "unknown" }
        switch central.state {
        case .poweredOn: return "poweredOn"
        case .poweredOff: return "poweredOff"
        case .unauthorized: return "unauthorized"
        case .unsupported: return "unsupported"
        case .resetting: return "resetting"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    private func append(_ reading: [String: Any], to sessionId: String) {
        guard var list = sessions[sessionId] else { return }
        list.append(reading)
        if list.count > Self.maxReadingsPerSession {
            list.removeFirst(list.count - Self.maxReadingsPerSession)
        }
        sessions[sessionId] = list
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn {
            // iOS drops every connection when Bluetooth goes off.
            connection = "idle"
        }
        refreshScan()
        announceConnectedSensors()
        updateConnection()
        emitStatus()
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let isNew = discovered[peripheral.identifier] == nil
        discovered[peripheral.identifier] = peripheral
        let name = peripheral.name
            ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? Self.fallbackName
        discoveredNames[peripheral.identifier] = name
        if scanning && isNew {
            notifyListeners("sensorFound", data: ["id": peripheral.identifier.uuidString, "name": name])
        }
        if reconnectScanning, peripheral.identifier == pairedId(), wantsConnection {
            reconnectScanning = false
            refreshScan()
            self.peripheral = peripheral
            peripheral.delegate = self
            setConnection("connecting")
            central.connect(peripheral, options: nil)
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard peripheral.identifier == self.peripheral?.identifier, wantsConnection else {
            central.cancelPeripheralConnection(peripheral)
            return
        }
        peripheral.delegate = self
        peripheral.discoverServices([Self.heartRateService])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard peripheral.identifier == self.peripheral?.identifier else { return }
        setConnection("idle")
        queue.asyncAfter(deadline: .now() + 5) { self.updateConnection() }
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard peripheral.identifier == self.peripheral?.identifier else { return }
        setConnection("idle")
        // Lost mid-run (out of range, the strap off the skin): ask again. The
        // request does not time out, so it reconnects when the sensor is back.
        if wantsConnection {
            setConnection("connecting")
            central.connect(peripheral, options: nil)
        }
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil,
              let service = peripheral.services?.first(where: { $0.uuid == Self.heartRateService }) else { return }
        peripheral.discoverCharacteristics([Self.heartRateMeasurement], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil,
              let measurement = service.characteristics?.first(where: { $0.uuid == Self.heartRateMeasurement }) else { return }
        peripheral.setNotifyValue(true, for: measurement)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if error == nil, characteristic.uuid == Self.heartRateMeasurement, characteristic.isNotifying {
            setConnection("connected")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil,
              characteristic.uuid == Self.heartRateMeasurement,
              peripheral.identifier == self.peripheral?.identifier,
              let value = characteristic.value, !value.isEmpty else { return }
        setConnection("connected")
        sequence += 1
        let reading: [String: Any] = [
            "id": "\(bootId)-\(sequence)",
            "at": Date().timeIntervalSince1970 * 1000,
            "bytes": value.map { Int($0) }
        ]
        if let sessionId = activeSessionId { append(reading, to: sessionId) }
        notifyListeners("reading", data: reading)
    }
}
