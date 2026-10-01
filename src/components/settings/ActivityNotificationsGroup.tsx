/**
 * ActivityNotificationsGroup — a switch per kind of activity notification
 * (S3: props and comments on, new followers off, no prompt to turn more
 * on).
 *
 * The server reads the same map (createNotification) and writes nothing for
 * a kind that is off, so a switch here stops the notification itself, not
 * just its row in the list. This replaced a list of every type under
 * "Individual controls are not available yet".
 */
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Toggle } from "@/components/ui/Toggle";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import {
  resolvedNotificationPreferences,
  type NotificationCategory,
} from "@/lib/notificationPreferences";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { haptic } from "@/lib/haptic";

const ROWS: {
  category: NotificationCategory;
  label: string;
  description?: string;
}[] = [
  { category: "kudos", label: "Props", description: "On your sessions" },
  { category: "comments", label: "Comments", description: "On your sessions" },
  { category: "follows", label: "New followers" },
  {
    category: "circles",
    label: "Circles",
    description: "Backing, milestones, new members",
  },
  {
    category: "spaces",
    label: "Spaces",
    description: "Props and comments on your posts",
  },
];

export default function ActivityNotificationsGroup() {
  const { profile, updateProfile } = useAuth();
  /* What the switches show while a save is in flight. Cleared when the
     latest save settles: on success the profile holds the same map, on a
     failure the profile still holds the old one (and updateProfile says
     it could not save). */
  const [pending, setPending] = useState<Record<
    NotificationCategory,
    boolean
  > | null>(null);
  const latest = useRef(0);

  if (!profile) return null;
  const current =
    pending ?? resolvedNotificationPreferences(profile.notificationPreferences);

  async function flip(category: NotificationCategory) {
    // The whole map, defaults filled in, so what is stored is what the
    // person saw.
    const next = { ...current, [category]: !current[category] };
    const mine = ++latest.current;
    setPending(next);
    haptic("light");
    trackSettingsEvent("settings_toggle_changed", {
      toggle: "activity_notification",
      value: `${category}:${next[category] ? "on" : "off"}`,
    });
    await updateProfile({ notificationPreferences: next });
    if (latest.current === mine) setPending(null);
  }

  return (
    <SettingsGroup
      title="Activity"
      footer="These show under the bell on Social, not as phone notifications."
    >
      {ROWS.map((row) => (
        <SettingsRow
          key={row.category}
          label={row.label}
          description={row.description}
          trailing={
            <Toggle
              label={row.label}
              checked={current[row.category]}
              onChange={() => void flip(row.category)}
            />
          }
        />
      ))}
    </SettingsGroup>
  );
}
