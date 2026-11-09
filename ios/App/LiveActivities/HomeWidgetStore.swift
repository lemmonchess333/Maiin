import Foundation

/// What the app and the widget extension keep in the App Group they share
/// (Wid1): the snapshot the app writes for the Home Screen and Lock Screen
/// widgets, and the drinks the food widget's "+" queues for the app to save.
///
/// Compiled into both targets: the app's `HomeWidgetsPlugin` writes the
/// snapshot and reads the drinks, the widgets read the snapshot and write
/// the drinks. The keys and the drink's fields are the ones
/// `src/lib/homeWidgetContract.ts` names, held to these by
/// `homeWidgetContract.test.ts`.
///
/// Each drink is kept under a key of its own, as the app's water queue keeps
/// each tap (`waterActions.ts`): the widget adding one and the app taking
/// others away never read and rewrite the same value, so neither can lose
/// the other's.
enum HomeWidgetStore {
    /// The App Group both App IDs carry (App.entitlements,
    /// LiveActivities.entitlements).
    static let appGroup = "group.com.tropos.app"
    static let snapshotKey = "tropos.widgets.snapshot"
    static let drinkKeyPrefix = "tropos.widgets.drink."

    /// The most a queue may hold: a widget left tapping while the app is
    /// never opened should not fill the App Group.
    static let maxQueuedDrinks = 40
    /// The most one drink may be, the water log's own ceiling
    /// (`MAX_SINGLE_LOG_ML`).
    static let maxDrinkMl = 3000

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    // MARK: The snapshot

    /// The snapshot as the app wrote it, JSON.
    static func snapshotData() -> Data? {
        defaults?.data(forKey: snapshotKey)
    }

    static func writeSnapshot(_ data: Data) -> Bool {
        guard let defaults else { return false }
        defaults.set(data, forKey: snapshotKey)
        return true
    }

    static func clearSnapshot() {
        defaults?.removeObject(forKey: snapshotKey)
    }

    // MARK: The queued drinks

    /// A drink the widget queued: `WidgetDrink` in homeWidgetContract.ts.
    struct QueuedDrink: Codable, Equatable {
        /// Made at the tap; the water receipt's id, so it is saved once.
        let id: String
        /// The tag of the account whose snapshot it was poured against.
        let account: String
        /// The local day of the tap, "yyyy-MM-dd".
        let date: String
        let ml: Int
        /// The tap, ms since 1970.
        let at: Double
    }

    /// Every queued drink, oldest first.
    static func queuedDrinks() -> [QueuedDrink] {
        guard let defaults else { return [] }
        let decoder = JSONDecoder()
        return defaults.dictionaryRepresentation()
            .filter { $0.key.hasPrefix(drinkKeyPrefix) }
            .compactMap { entry -> QueuedDrink? in
                guard let data = entry.value as? Data else { return nil }
                return try? decoder.decode(QueuedDrink.self, from: data)
            }
            .sorted { $0.at < $1.at }
    }

    /// Every key that holds a queued drink, readable or not, so the app can
    /// clear an entry it cannot read.
    static func queuedDrinkIds() -> [String] {
        guard let defaults else { return [] }
        return defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(drinkKeyPrefix) }
            .map { String($0.dropFirst(drinkKeyPrefix.count)) }
    }

    /// Queues a drink. False when there is no App Group, the amount is out of
    /// range, or the queue is full.
    @discardableResult
    static func queueDrink(_ drink: QueuedDrink) -> Bool {
        guard let defaults,
              (1...maxDrinkMl).contains(drink.ml),
              !drink.id.isEmpty,
              queuedDrinkIds().count < maxQueuedDrinks,
              let data = try? JSONEncoder().encode(drink) else { return false }
        defaults.set(data, forKey: drinkKeyPrefix + drink.id)
        return true
    }

    /// Forgets the drinks named, and only those.
    static func removeDrinks(ids: [String]) {
        guard let defaults else { return }
        for id in ids where !id.isEmpty {
            defaults.removeObject(forKey: drinkKeyPrefix + id)
        }
    }
}
