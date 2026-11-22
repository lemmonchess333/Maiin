// The display register's wide italic cut, as FinishHero loads it.
import "@fontsource-variable/archivo/wdth-italic.css";

/**
 * Run27 (1): the 3-2-1 between Start and the run, on the run screen's dark
 * stage. The whole screen is the tap that skips it, as on Strava's and Nike
 * Run Club's; the second is the live screen's one display figure
 * (DESIGN_GUIDE §4), and moves in as it changes, where motion is welcome.
 * Nothing is recorded behind it: the clock starts at Go
 * (useStartCountdown).
 */
export default function StartCountdown({
  seconds,
  onSkip,
}: {
  seconds: number;
  onSkip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSkip}
      aria-label="Start now"
      className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-white"
    >
      <span
        key={seconds}
        aria-hidden="true"
        className="ds-display-figure ds-display-countdown ds-countdown-tick"
      >
        {seconds}
      </span>
      <span className="text-sm text-white/60">Tap to start now</span>
    </button>
  );
}
