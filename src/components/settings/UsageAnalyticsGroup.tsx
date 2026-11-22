/**
 * Share usage analytics (Priv1 call 2): the switch that turns Google
 * Analytics off on the iPhone and on the web, the simple, free way to
 * object that PECR's analytics exemption asks for. On by default. The
 * rules for the answer are in `src/lib/usageAnalytics.ts`.
 *
 * Off stops this device at once (`setUsageAnalytics`), before the account
 * has saved it, and false is kept on the account so it follows the person
 * to their other devices. A save that fails puts this device back as the
 * account still has it, which is what the switch then shows beside the
 * "Couldn’t save" toast. Shown on the web too, where it stops the web's
 * analytics, so it can be checked in the preview before a phone.
 *
 * It sends no analytics event of its own, unlike the switches beside it:
 * turning analytics off is not reported to analytics.
 */
import { Toggle } from "@/components/ui/Toggle";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import { setUsageAnalytics } from "@/lib/analyticsProvider";
import {
  USAGE_ANALYTICS_DESCRIPTION,
  accountSharesUsageAnalytics,
} from "@/lib/usageAnalytics";
import { haptic } from "@/lib/haptic";
import type { UpdateProfileResult, UserProfile } from "@/lib/auth";

export default function UsageAnalyticsGroup({
  profile,
  updateProfile,
}: {
  profile: Pick<UserProfile, "usageAnalytics">;
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
}) {
  const on = accountSharesUsageAnalytics(profile);

  async function flip() {
    const next = !on;
    haptic("light");
    setUsageAnalytics(next);
    const saved = await updateProfile({ usageAnalytics: next });
    if (!saved.ok) setUsageAnalytics(on);
  }

  return (
    <SettingsGroup title="Analytics">
      <SettingsRow
        label="Share usage analytics"
        description={USAGE_ANALYTICS_DESCRIPTION}
        trailing={
          <Toggle
            label="Share usage analytics"
            checked={on}
            onChange={() => void flip()}
          />
        }
      />
    </SettingsGroup>
  );
}
