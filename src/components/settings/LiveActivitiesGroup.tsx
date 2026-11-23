/**
 * LiveActivitiesGroup — the switch that turns Tropos's Live Activities
 * off (Wid2 call 6): a run's and a lift's card on the Lock Screen and in
 * the Dynamic Island. Apple asks that they be easy to turn off in the
 * app, beside iOS's own switch for the app.
 *
 * It is this phone's (`liveActivitySetting.ts`), as the Lock Screen is.
 * Shown on the web too, where nothing reaches a Lock Screen, so the
 * setting can be seen and checked in the web preview before a phone.
 */
import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import {
  liveActivitiesOn,
  setLiveActivitiesOn,
} from "@/lib/liveActivitySetting";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { haptic } from "@/lib/haptic";

export default function LiveActivitiesGroup() {
  const [on, setOn] = useState(liveActivitiesOn);

  function flip() {
    const next = !on;
    setOn(next);
    setLiveActivitiesOn(next);
    haptic("light");
    trackSettingsEvent("settings_toggle_changed", {
      toggle: "live_activities",
      value: next ? "on" : "off",
    });
  }

  return (
    <SettingsGroup title="Lock Screen">
      <SettingsRow
        label="Live Activities"
        description="Your run or workout while it’s going"
        trailing={
          <Toggle label="Live Activities" checked={on} onChange={flip} />
        }
      />
    </SettingsGroup>
  );
}
