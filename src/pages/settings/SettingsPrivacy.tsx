/** SettingsPrivacy — Social & privacy nested page (Set1.2). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EyeOff, HeartPulse } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import SettingsSection from "@/components/settings/SettingsSection";
import PrivacySection from "@/components/settings/PrivacySection";
import RestrictionExplainer from "@/components/settings/RestrictionExplainer";
import UsageAnalyticsGroup from "@/components/settings/UsageAnalyticsGroup";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import InlineNumerals from "@/components/ui/InlineNumerals";
import {
  DELETE_ACCOUNT_ANCHOR,
  HEALTH_CONSENT_SETTINGS_COPY,
  healthConsentSettingsLine,
} from "@/lib/healthConsent";
import { formatDayMonthYear } from "@/utils/formatters";

export default function SettingsPrivacy() {
  const { user, profile, updateProfile, updateShareDefaults, refreshProfile } =
    useAuth();
  const navigate = useNavigate();
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);

  // The Sharing row shows the account's answers, which another device may
  // have changed since this one loaded the profile. Read them again when
  // the page opens.
  useEffect(() => {
    refreshProfile().catch((err: unknown) =>
      logger.warn("[SettingsPrivacy] couldn't read the profile:", err)
    );
  }, [refreshProfile]);

  if (!profile) return <SettingsSection title="Social & privacy" />;
  const healthConsentLine = healthConsentSettingsLine(
    profile.healthDataConsent,
    formatDayMonthYear
  );

  return (
    <SettingsSection
      title="Social & privacy"
      subtitle="Visibility, auto-post, GPS zones"
      section="privacy"
    >
      {/* Only for a restricted account: what is stopped and why (S4e D6). */}
      <RestrictionExplainer uid={user?.uid} />
      <PrivacySection
        inline
        user={user}
        profile={profile}
        updateProfile={updateProfile}
        updateShareDefaults={updateShareDefaults}
        privacyZones={privacyZones}
        addZone={addZone}
        removeZone={removeZone}
        newZoneName={newZoneName}
        setNewZoneName={setNewZoneName}
        newZoneRadius={newZoneRadius}
        setNewZoneRadius={setNewZoneRadius}
      />
      {/* The posts hidden from the feed, each with Unhide (App1 Q38). */}
      <SettingsGroup title="Your feed">
        <SettingsRow
          icon={EyeOff}
          label="Hidden posts"
          description="See the posts you’ve hidden and unhide them"
          onClick={() => navigate("/settings/hidden-posts")}
        />
      </SettingsGroup>
      {/* Priv1 call 1: when the person agreed to Tropos storing their
          health details, and that withdrawing is deleting the account,
          which the row opens. */}
      {healthConsentLine && (
        <SettingsGroup>
          <SettingsRow
            icon={HeartPulse}
            label={HEALTH_CONSENT_SETTINGS_COPY.label}
            description={<InlineNumerals>{healthConsentLine}</InlineNumerals>}
            onClick={() =>
              navigate(`/settings/account#${DELETE_ACCOUNT_ANCHOR}`)
            }
          />
        </SettingsGroup>
      )}
      {/* Google Analytics, on unless turned off (Priv1 call 2). */}
      <UsageAnalyticsGroup profile={profile} updateProfile={updateProfile} />
    </SettingsSection>
  );
}
