/**
 * What the app sends Tropos's Live Activity widget, and the parts of a
 * start the plugin insists on that the widget never reads.
 *
 * The widget extension (`ios/App/LiveActivities/`) draws the lock screen
 * card and the Dynamic Island itself, in SwiftUI, from the activity's
 * content state: the `data` object each start and update sends, one kind
 * per activity, named by its `kind`. Drawn natively, the rest's countdown
 * and its bar are the system's own and keep time with the app asleep,
 * which no JSON layout can do.
 *
 * `capacitor-live-activities` was built to draw a JSON layout the app
 * sends, and refuses a start without one, so every start carries
 * `PLUGIN_LAYOUT`: the smallest layout it accepts. It is no design, and
 * nothing reads it.
 *
 * The keys below are read by name in
 * `ios/App/LiveActivities/LiveActivityPayload.swift`, and
 * `liveActivityContract.test.ts` holds the two lists to each other.
 */
import type {
  DynamicIslandLayout,
  LayoutElement,
  LiveActivitiesBehavior,
} from "capacitor-live-activities";

/** The data keys a run's card reads. */
export const RUN_ACTIVITY_KEYS = [
  "kind",
  "distance",
  "pace",
  "elapsed",
  "label",
  "paused",
] as const;

/** The data keys a rest's card reads. */
export const REST_ACTIVITY_KEYS = [
  "kind",
  "startedAt",
  "endsAt",
  "exercise",
  "set",
] as const;

const PLACEHOLDER: LayoutElement = {
  type: "text",
  properties: [{ text: "Tropos" }],
};

/** What the plugin needs beside the data before it will start an
 *  activity. The widget draws from the data alone. */
export const PLUGIN_LAYOUT: {
  layout: LayoutElement;
  dynamicIslandLayout: DynamicIslandLayout;
  behavior: LiveActivitiesBehavior;
} = {
  layout: PLACEHOLDER,
  dynamicIslandLayout: {
    expanded: { center: PLACEHOLDER },
    compactLeading: PLACEHOLDER,
    compactTrailing: PLACEHOLDER,
    minimal: PLACEHOLDER,
  },
  // Tapping the card opens the app where it was; the widget sets no URL.
  behavior: { widgetUrl: "" },
};
