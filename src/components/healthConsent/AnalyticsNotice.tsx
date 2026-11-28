import {
  USAGE_ANALYTICS_NOTICE,
  USAGE_ANALYTICS_OFF_NOTICE,
  USAGE_ANALYTICS_TURN_OFF,
} from "@/lib/usageAnalytics";

/**
 * The analytics line on the health-details agreement (owner, 23 November
 * 2026): what Google Analytics counts and why, ending in Turn off, the
 * simple way to object the statistical-purposes exception asks for. Once
 * analytics is off (tapped here, or already off on this device or the
 * account) the line says so and points at Settings, the way back on. The
 * screen decides what Turn off writes: this device in setup, carried onto
 * the account by `completeOnboarding`; the account itself on the
 * agreement's own screen.
 *
 * Turn off is a link inside the sentence, so it is a bare button in the
 * house link style rather than the Button primitive's block. Its 44 px
 * target comes from vertical padding taken back by a negative margin, so
 * the line keeps its height.
 */
export default function AnalyticsNotice({
  off,
  onTurnOff,
  disabled = false,
}: {
  off: boolean;
  onTurnOff: () => void;
  disabled?: boolean;
}) {
  if (off)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {USAGE_ANALYTICS_OFF_NOTICE}
      </p>
    );
  return (
    <p className="text-sm text-muted-foreground">
      {USAGE_ANALYTICS_NOTICE}{" "}
      <button
        type="button"
        onClick={onTurnOff}
        disabled={disabled}
        className="inline-block min-w-11 py-3 -my-3 text-center font-medium link-inline hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm disabled:opacity-50"
      >
        {USAGE_ANALYTICS_TURN_OFF}
      </button>
    </p>
  );
}
