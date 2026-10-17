/**
 * Lets the run's voice cues speak. iOS speaks only for a page that has
 * already spoken inside a tap, so this speaks one silent, empty line, and
 * it must run in the tap's own handler, before anything awaits. The Run
 * page's Starts call it through `useAudioCues`'s `prime`; Home's run card
 * calls it directly, because its Start goes straight into the run and the
 * Run page's start is no longer a tap of its own (`startOnArrival`).
 *
 * Returns whether the device can speak at all.
 */
export function unlockSpeech(): boolean {
  if (!("speechSynthesis" in window)) return false;
  const line = new SpeechSynthesisUtterance("");
  line.volume = 0;
  speechSynthesis.speak(line);
  return true;
}
