import SustainedOfflineBanner from "@/components/ui/SustainedOfflineBanner";

/**
 * Programme-page offline notice, page-specific copy over the shared
 * SustainedOfflineBanner primitive (which owns the 30s timer, a11y and
 * animation). Most programme edits are server-validated commands and need
 * a connection; finishing a workout is a local batch write the SDK
 * replays, so that half keeps working and the copy says so.
 */
export default function ProgramOfflineBanner() {
  return (
    <SustainedOfflineBanner bannerKey="program-offline">
      Most programme edits need a connection. Finishing a workout still saves on
      this device and syncs when you reconnect.
    </SustainedOfflineBanner>
  );
}
