import SustainedOfflineBanner from "@/components/ui/SustainedOfflineBanner";

/**
 * Settings offline notice, page-specific copy over the shared
 * SustainedOfflineBanner primitive. Preference writes go through the
 * guarded profile merge and replay on reconnect; password (Firebase Auth),
 * account deletion (callable) and subscription changes need the network.
 */
export default function SettingsOfflineBanner() {
  return (
    <SustainedOfflineBanner bannerKey="settings-offline">
      Preference changes save on this device and sync when you reconnect.
      Password, account and subscription changes need a connection.
    </SustainedOfflineBanner>
  );
}
