import AppIntents
import Foundation

/// The food widget's "+" (Wid1 call 2), on iOS 17 and later, where a widget
/// button can run an App Intent without opening the app.
///
/// It queues the drink in the App Group, with an id made here, for the app
/// to save on its next open through the water log's own queue
/// (`widgetDrinks.ts`): the id becomes the water receipt's, so the drink is
/// saved once however often the app replays it. The widget adds it to the
/// total it draws at once. Until the app opens, Firestore, the Watch and the
/// web see less water, which Wid1 accepts for v1.
///
/// Nothing is queued without a snapshot: the drink is poured against the
/// account the snapshot names, and sign-out clears it.
@available(iOS 17.0, *)
struct LogDrinkIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a drink"
    static var description = IntentDescription("Adds a drink to today's water in Tropos.")
    static var openAppWhenRun = false

    @Parameter(title: "Millilitres")
    var millilitres: Int

    init() {}

    init(millilitres: Int) {
        self.millilitres = millilitres
    }

    func perform() async throws -> some IntentResult {
        guard let snapshot = HomeWidgetSnapshot.load(), snapshot.water != nil else {
            return .result()
        }
        let now = Date()
        HomeWidgetStore.queueDrink(
            HomeWidgetStore.QueuedDrink(
                id: UUID().uuidString,
                account: snapshot.account,
                date: WidgetCalendar.key(now),
                ml: min(max(millilitres, 1), HomeWidgetStore.maxDrinkMl),
                at: (now.timeIntervalSince1970 * 1000).rounded()
            )
        )
        return .result()
    }
}
